package frigateservice

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"

	"github.com/rs/zerolog/log"
	"gosrc.io/mqtt"
)

func makeHTTPRequest(method, url string, body any) (string, error) {
	// Convert the body to JSON if it's not nil
	var requestBody io.Reader
	if body != nil {
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return "", err
		}
		requestBody = bytes.NewBuffer(bodyBytes)
	}

	// Create a new HTTP request
	req, err := http.NewRequest(method, url, requestBody)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	// Create an HTTP client
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // Use with caution in production
		},
	}

	// Perform the request
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if method == "GET" {
		// Read the response body
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}
		// Return the response as a string
		return string(bodyBytes), nil
	}
	return "", nil
}

func publishToTopic(client *mqtt.Client, topic string) {
	// Create a new MQTT message
	// Publish the message to the specified topic
	client.Publish(topic, []byte("Hello, MQTT!"))
	log.Info().Msgf("Published message to topic %s\n", topic)
}

func (fs *FrigateService) Start(callBack func(string, bool)) error {
	// Set up the MQTT client
	client := mqtt.NewClient(fs.MqttURL + ":" + fs.MqttPort)
	client.ClientID = "MQTT-Sub"

	messages := make(chan mqtt.Message)
	client.Messages = messages

	postConnect := func(c *mqtt.Client) {
		log.Info().Msg("mqtt Connected")

		// List of topics to subscribe to
		topics := fs.FrigateTopics
		if len(topics) == 0 {
			log.Info().Msgf("No topics to subscribe to, defaulting to frigate/events and frigate/tracked_object_update")
			topics = []string{"frigate/events", "frigate/tracked_object_update"}
		}
		// Subscribe to each topic
		for _, name := range topics {
			topic := mqtt.Topic{Name: name, QOS: 0}
			c.Subscribe(topic)
			log.Info().Msgf("Subscribed to topic: %s\n", name)
		}

		publishToTopic(c, "frigate/onConnect")
	}
	cm := mqtt.NewClientManager(client, postConnect)
	cm.Start()

	for m := range messages {
		cameraDetectEvent := Event{}
		err := json.Unmarshal(m.Payload, &cameraDetectEvent)
		if err != nil {
			log.Warn().Msgf("Error unmarshalling JSON: %v\n", err)
			continue
		}
		log.Debug().Msgf("Camera: %s, ID: %s, Label: %s, Score: %f\n", cameraDetectEvent.Before.Camera, cameraDetectEvent.Before.ID, cameraDetectEvent.Before.Label, cameraDetectEvent.Before.Score)

		// These are the cameras that we want to track
		// We add the extras in case this is an exit event
		possibleZones := append(cameraDetectEvent.After.CurrentZones, cameraDetectEvent.After.EnteredZones...)

		// Deduplicate the list using a map
		uniqueZones := make(map[string]bool)
		for _, zone := range possibleZones {
			uniqueZones[zone] = true
		}

		// Loop through the deduplicated zones and execute the callback
		for zone := range uniqueZones {
			log.Info().Msgf("Executing callback for zone: %s\n", zone)
			callBack(zone+":"+cameraDetectEvent.Before.Label, false)
		}


	}
	return nil
}
