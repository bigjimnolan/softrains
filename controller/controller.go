package controller

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bigjimnolan/softrains/frigateservice"
	"github.com/bigjimnolan/softrains/hubitatservice"
	"github.com/bigjimnolan/softrains/mqttservice"
	"github.com/bigjimnolan/softrains/uiservice"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var (
	mailChannel           = make(chan []hubitatservice.ActionType)
	updateChannel         = make(chan uiservice.UpdateMsg)
	hserviceUpdateChannel = make(chan hubitatservice.HubitatDeviceInfo)
	actionsList           = make(map[string][]hubitatservice.ActionType)
	actionsListMutex      sync.Mutex
)

func startControllerChannel(actionsListLocation string) {
	// This function is used to start the controller channel
	// It is used to send actions to the hubitat service
	// and updates to the UI service
	for update := range updateChannel {
		log.Debug().Msgf("Received updates: %v", update)
		// Process updates here, e.g., send to UI service
		switch update.UpdateType {
		case "device":
			deviceUpdate, ok := update.UpdateData.(hubitatservice.HubitatDeviceInfo)
			if !ok {
				log.Warn().Msg("UpdateData is not of type HubitatDeviceInfo")
				break
			}
			hserviceUpdateChannel <- deviceUpdate
		case "action":
			err := getActions(actionsListLocation)
			if err != nil {
				log.Error().Msgf("Failed to get actions: %v", err)
			}
		default:
			log.Warn().Msgf("Unknown update type: %v", update.UpdateType)
		}
	}
}

// Call actions tries to find registered actions, and, if so, run them.
func CallActions(from string, preProcess bool) {
	log.Debug().Msgf("CallActions called for: %v", from)
	actions, ok := actionsList[from]
	if ok {
		mailChannel <- actions
		return
	}

	log.Debug().Msgf("input device not found: %v\nCalling default actions: \n%v", from, actionsList["default"])
	mailChannel <- actionsList["default"]
}

// startHubitatService creates the inital hubitat connection. This listens on a channel created in main an shared between the services
func buildHubitatService(hubitatConfig hubitatservice.HubitatServiceConfig) (hubitatservice.HubitatService, error) {
	err := getActions(hubitatConfig.ActionsListLocation)
	if err != nil {
		return hubitatservice.HubitatService{}, err
	}

	return hubitatservice.HubitatService{
		HubitatChannel:       &mailChannel,
		HubitatDeviceList:    hubitatConfig.HubitatDevices,
		AutomaticAction:      make(map[string]hubitatservice.ActionType),
		Timeout:              hubitatConfig.TimeoutSeconds,
		DeviceBackoff:        make(map[int]time.Time),
		DeviceBackoffEnabled: hubitatConfig.DeviceBackoffEnabled,
		UpdateChannel:        &hserviceUpdateChannel,
	}, nil
}

func getSecrets(hubDevices map[int]hubitatservice.HubitatDeviceInfo) {
	for _, device := range hubDevices {
		tokenString := "HUBITAT_ACCESS_TOKEN_" + strconv.Itoa(device.APIID)
		token := os.Getenv(tokenString)
		if token == "" {
			log.Warn().Msgf("Could not find token at: %v\n", tokenString)
			continue
		}
		*device.DeviceURL = strings.Replace(*device.DeviceURL, "<access_token>", token, 1)
	}
}

func buildSoftRains() (*SoftRainsConfig, error) {
	softRains, err := os.Open(os.Getenv("SOFTRAINS_CONFIG_FILE"))
	if err != nil {
		log.Fatal().Msgf("Config File not found, check location set at Environment Variable: SOFTRAINS_CONFIG_FILE\n%v", err)
	}
	defer softRains.Close()

	// Decode the JSON data into a struct
	var softRainsConfig SoftRainsConfig
	decoder := json.NewDecoder(softRains)
	err = decoder.Decode(&softRainsConfig)
	if err != nil {
		return &SoftRainsConfig{}, err
	}

	getSecrets(softRainsConfig.HubitatConfig.HubitatDevices)
	return &softRainsConfig, nil
}

func getActions(actionFilePath string) error {
	file, err := os.Open(actionFilePath)
	if err != nil {
		return err
	}
	defer file.Close()

	actionsToParse := []hubitatservice.ActionInput{}
	decoder := json.NewDecoder(file)
	err = decoder.Decode(&actionsToParse)
	if err != nil {
		return err
	}

	actionsListMutex.Lock()
	defer actionsListMutex.Unlock()
	// Empty the actionsList before reloading
	for k := range actionsList {
		delete(actionsList, k)
	}

	for _, action := range actionsToParse {
		actionsList[action.CameraSource] = append(actionsList[action.CameraSource], hubitatservice.ActionType{
			PrimaryAction:   action.PrimaryAction,
			SecondaryAction: action.SecondaryAction,
			DeviceId:        action.DeviceID,
			StartDelay:      time.Duration(action.Delay) * time.Second,
			BackoffDelay:    *action.Backoff,
		})
	}

	log.Trace().Msgf("Actions Loaded: %v\n", actionsList)
	return nil
}

func setLogLevel(logLevel string) {
	switch logLevel {
	case "info":
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "trace":
		zerolog.SetGlobalLevel(zerolog.TraceLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
	}

	fmt.Printf("logLevel: %v\n", zerolog.GlobalLevel())
}

func StartHere() {

	// This loads the configuration file from the location set in the environment variable
	// SOFT_RAINS_CONFIG This step also adds the access token to the device URL
	// for each device in the configuration file
	// The access token is set in the environment variable: AccessToken<APIID>
	softRainsConfig, err := buildSoftRains()
	if err != nil {
		log.Fatal().Msgf("Config File not found, check location set at Environment Variable: SOFT_RAINS_CONFIG\n%v", err)
	}

	// Set the log level based on the configuration
	setLogLevel(softRainsConfig.LogLevel)

	wg := &sync.WaitGroup{}
	// Start the controller channel
	log.Info().Msg("Starting controller channel")
	wg.Add(1)
	go func(actionsListLocation string) {
		defer wg.Done()
		startControllerChannel(actionsListLocation)
	}(softRainsConfig.HubitatConfig.ActionsListLocation)

	// Start MQTT service
	log.Info().Msg("Starting MQTT service")
	wg.Add(1)
	go func(ms mqttservice.MQTTService) {
		defer wg.Done()
		err := ms.Start()
		if err != nil {
			log.Fatal().Msgf("MQTT Service Failed to Start %v", err)
		}
	}(softRainsConfig.MQTTService)

	// Start Frigate service
	// This service is responsible subscribing to the frigate events and queuing the actions
	// to be run on the hubitat devices
	log.Info().Msg("Starting frigate service")
	wg.Add(1)
	go func(fs frigateservice.FrigateService) {
		defer wg.Done()
		err := fs.Start(CallActions)
		if err != nil {
			log.Fatal().Msgf("Frigate Service Failed to Start %v", err)
		}
	}(softRainsConfig.FrigateService)

	// Start Hubitat service
	// This service is responsible for running the actions on the hubitat devices
	log.Info().Msg("Starting hubitat service")
	hubitatService, err := buildHubitatService(softRainsConfig.HubitatConfig)
	if err != nil {
		log.Fatal().Msgf("Hubitat Service Failed to Start%v", err)
	}

	wg.Add(1)
	go func(hubitatService hubitatservice.HubitatService) {
		defer wg.Done()
		hubitatService.Start()
	}(hubitatService)

	// Start the UI service
	log.Info().Msg("Starting UI service")
	wg.Add(1)
	go func(ui *uiservice.UIService) {
		defer wg.Done()
		ui.UpdateChannel = &updateChannel
		err := ui.Start()
		if err != nil {
			log.Fatal().Msgf("UI Service Failed to Start %v", err)
		}
	}(&softRainsConfig.UIService)

	// Wait for all services to finish
	wg.Wait()
	log.Info().Msg("All services stopped")
}
