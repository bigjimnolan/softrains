package hubitatservice

import (
	"crypto/sha1"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func (hs HubitatService) Start() {
	// create the map we use later

	for {
		hs.checkListAndSend()

		// check channel for a few seconds
		select {
		case actionList := <-*hs.HubitatChannel:
			// Add actions to queue
			deviceIds := make(map[int]bool)
			log.Trace().Msgf("Got Actions: \n%v\n", actionList)

			for _, action := range actionList {
				log.Debug().Msgf("Filtering Action: %v", action)
				inBackoff := hs.DeviceBackoffEnabled && hs.DeviceBackoff[action.DeviceId].After(time.Now()) && action.PrimaryAction != "off"
				if !inBackoff {
					action.CurrentDelay = time.Now().Add(action.StartDelay)
					log.Info().Msg(fmt.Sprintf("Adding: %v", action))
					combinedKey := strconv.Itoa(action.DeviceId) + action.PrimaryAction + action.SecondaryAction
					hash := sha1.Sum([]byte(combinedKey))
					keyHash := hex.EncodeToString(hash[:])
					hs.AutomaticAction[keyHash] = action
					deviceIds[action.DeviceId] = true
				} else {
					// Make this an allow list later, but for now, filter on "off"
					log.Debug().Msgf("Backoff: %v; until: %v", action.DeviceId, hs.DeviceBackoff[action.DeviceId])
				}
			}

			// Check if we need to set a backoff timer
			// for any of the devices
			if hs.DeviceBackoffEnabled { // Add/update backoff
				for _, action := range actionList {
					if hs.DeviceBackoff[action.DeviceId].Before(time.Now()) { // expired, add new backoff
						hs.DeviceBackoff[action.DeviceId] = time.Now().Add(action.BackoffDelay)
					} else { // already active, extend
						hs.DeviceBackoff[action.DeviceId] = hs.DeviceBackoff[action.DeviceId].Add(action.BackoffDelay)
					}
				}
			}
		case update := <-*hs.UpdateChannel:
			log.Debug().Msgf("Received update: %v", update)
			hs.HubitatDeviceList[update.DeviceID] = update
		case <-time.After(time.Duration(hs.Timeout) * time.Second):
			continue
		}
	}

}

// checkListAndSend is our polling interface for our schedule list.
func (hs HubitatService) checkListAndSend() {
	for combinedKey, actionInfo := range hs.AutomaticAction {
		if actionInfo.CurrentDelay.Before(time.Now()) {
			if actionInfo.DeviceId == 0 {
				callPostAction(*hs.HubitatDeviceList[actionInfo.DeviceId].DeviceURL, *hs.HubitatDeviceList[actionInfo.DeviceId].PostBody, actionInfo.PrimaryAction, actionInfo.SecondaryAction, true)
			} else {
				log.Debug().Msg(fmt.Sprintf("Running Action: %v -> %v:%v", actionInfo.DeviceId, actionInfo.PrimaryAction, actionInfo.SecondaryAction))
				callAction(*hs.HubitatDeviceList[actionInfo.DeviceId].DeviceURL, actionInfo.PrimaryAction, actionInfo.SecondaryAction)
			}
			delete(hs.AutomaticAction, combinedKey)
		}
	}
}

// callAction hits the hubitat MakerAPI and, for now updates a single action (on or off)
func callAction(url string, action string, secondaryAction string) error {
	url = strings.Replace(url, "<action>", action, 1)
	url = strings.Replace(url, "<action2>", secondaryAction, 1)
	client := http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	res, err := client.Get(url)
	if err != nil {
		return err
	}

	if log.Logger.GetLevel() == zerolog.TraceLevel {
		resBody, err := io.ReadAll(res.Body)
		if err != nil {
			return err
		}

		fmt.Printf("client: response body: %s\n", resBody)
	}

	return nil
}

// callPostAction hits other places
func callPostAction(url string, postBody string, action string, secondaryAction string, print bool) error {
	url = strings.Replace(url, "<action>", action, 1)
	postBody = strings.Replace(postBody, "<action2>", secondaryAction, 1)
	client := http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	log.Debug().Msgf("Post URL: %v", url)
	log.Debug().Msgf("Post Body: %v", postBody)
	req, err := http.NewRequest("POST", url, strings.NewReader(postBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json") // Set appropriate content type

	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if print {
		resBody, err := io.ReadAll(res.Body)
		if err != nil {
			return err
		}

		fmt.Printf("client: response body: %s\n", resBody)
	}

	return nil
}
