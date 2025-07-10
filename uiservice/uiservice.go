package uiservice

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"html/template"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/bigjimnolan/softrains/hubitatservice"
	"github.com/rs/zerolog/log"
)

type UIService struct {
	ActionsPath      string
	ConfigPath       string
	ServerKeyPath    string
	ServerCertPath   string
	TLSListenPort    string
	WebFolderDocRoot string
	authPassword     string
	actionsMutex     sync.Mutex
	configMutex      sync.Mutex
	UpdateChannel    *chan UpdateMsg
}

type UpdateMsg struct {
	UpdateType string      `json:"updateType"`
	UpdateData interface{} `json:"updateData"`
}

func (ui *UIService) Start() error {
	ui.authPassword = os.Getenv("SOFTRAINS_AUTH_PASSWORD")
	http.HandleFunc("/", ui.loginHandler)
	http.HandleFunc("/dashboard", ui.authMiddleware(ui.dashboardHandler))
	http.HandleFunc("/action", ui.authMiddleware(ui.actionHandler))
	http.HandleFunc("/device", ui.authMiddleware(ui.deviceHandler))
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(ui.WebFolderDocRoot+"static"))))

	if _, err := os.Stat(ui.ServerCertPath); err != nil {
		log.Fatal().Msgf("cert not found at %s: %v", ui.ServerCertPath, err)
	}
	if _, err := os.Stat(ui.ServerKeyPath); err != nil {
		log.Fatal().Msgf("key not found at %s: %v", ui.ServerKeyPath, err)
	}

	server := &http.Server{
		Addr:    ":" + ui.TLSListenPort,
		Handler: nil,
		TLSConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}
	log.Info().Msg("UI running on https://0.0.0.0:" + ui.TLSListenPort)
	return server.ListenAndServeTLS(ui.ServerCertPath, ui.ServerKeyPath)
}

func (ui *UIService) loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		r.ParseForm()
		if r.FormValue("password") == ui.authPassword {
			http.SetCookie(w, &http.Cookie{Name: "softrains_auth", Value: ui.authPassword, Path: "/", Secure: true, HttpOnly: true})
			http.Redirect(w, r, "/dashboard", http.StatusSeeOther)
			return
		}
	}
	tmpl := template.Must(template.ParseFiles(ui.WebFolderDocRoot + "templates/login.html"))
	tmpl.Execute(w, nil)
}

func (ui *UIService) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("softrains_auth")
		if err != nil || cookie.Value != ui.authPassword {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		next(w, r)
	}
}

func (ui *UIService) dashboardHandler(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.ParseFiles(ui.WebFolderDocRoot + "templates/dashboard.html"))
	actions, _ := ui.loadActions()
	devices, _ := ui.loadDevices()
	err := tmpl.Execute(w, map[string]interface{}{
		"Actions": actions,
		"Devices": devices,
	})
	if err != nil {
		http.Error(w, "Error rendering dashboard", http.StatusInternalServerError)
		log.Error().Msgf("Error rendering dashboard: %v", err)
		return
	}
	log.Debug().Msgf("Dashboard rendered with %d actions and %d devices", len(actions), len(devices))
}

func (ui *UIService) actionHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "POST":
		mode := r.URL.Query().Get("mode")
		ui.actionsMutex.Lock()
		defer ui.actionsMutex.Unlock()
		actions, _ := ui.loadActions()
		if mode == "add" {
			deviceID, ok := ui.parseIntField(r.FormValue("deviceId"), "deviceId", w)
			if !ok {
				log.Error().Msg("Failed to parse deviceId for action add")
				http.Error(w, "Invalid deviceId", http.StatusBadRequest)
				return
			}
			delay, ok := ui.parseIntField(r.FormValue("delay"), "delay", w)
			if !ok {
				log.Error().Msg("Failed to parse delay for action add")
				http.Error(w, "Invalid delay", http.StatusBadRequest)
				return
			}
			backoffPtr, ok := ui.parseDurationPtr(r.FormValue("backoff"), "backoff", w)
			if !ok {
				log.Error().Msg("Failed to parse backoff for action add")
				http.Error(w, "Invalid backoff", http.StatusBadRequest)
				return
			}
			newAction := hubitatservice.ActionInput{
				DeviceID:        deviceID,
				Delay:           delay,
				PrimaryAction:   r.FormValue("primaryAction"),
				SecondaryAction: r.FormValue("secondaryAction"),
				CameraSource:    r.FormValue("cameraSource"),
				Backoff:         backoffPtr,
			}
			actions = append(actions, newAction)
			err := ui.saveActions(actions)
			if err != nil {
				log.Error().Msgf("Failed to save actions: %v", err)
				http.Error(w, "Failed to save actions", http.StatusInternalServerError)
				return
			}
			*ui.UpdateChannel <- UpdateMsg{
				UpdateType: "action",
				UpdateData: newAction,
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Action added"))
		} else if mode == "edit" {
			actionID, ok := ui.parseIntField(r.FormValue("deviceId"), "deviceId", w)
			if !ok {
				log.Error().Msg("Failed to parse deviceId for action edit")
				http.Error(w, "Invalid deviceId", http.StatusBadRequest)
				return
			}
			found := false
			for i, a := range actions {
				if a.DeviceID == actionID {
					delay, ok := ui.parseIntField(r.FormValue("delay"), "delay", w)
					if !ok {
						log.Error().Msg("Failed to parse delay for action edit")
						http.Error(w, "Invalid delay", http.StatusBadRequest)
						return
					}
					backoffPtr, ok := ui.parseDurationPtr(r.FormValue("backoff"), "backoff", w)
					if !ok {
						log.Error().Msg("Failed to parse backoff for action edit")
						http.Error(w, "Invalid backoff", http.StatusBadRequest)
						return
					}
					actions[i].Delay = delay
					actions[i].PrimaryAction = r.FormValue("primaryAction")
					actions[i].SecondaryAction = r.FormValue("secondaryAction")
					actions[i].CameraSource = r.FormValue("cameraSource")
					actions[i].Backoff = backoffPtr
					*ui.UpdateChannel <- UpdateMsg{
						UpdateType: "action",
						UpdateData: actions[i],
					}
					found = true
					log.Info().Msgf("Action with deviceId %d updated", i)
					break
				}
			}
			if !found {
				log.Error().Msgf("Action with deviceId %d not found for edit", actionID)
				http.Error(w, "Action not found", http.StatusNotFound)
				return
			}
			err := ui.saveActions(actions)
			if err != nil {
				log.Error().Msgf("Failed to save actions: %v", err)
				http.Error(w, "Failed to save actions", http.StatusInternalServerError)
				return

			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Action updated"))
		}
	case "DELETE":
		actionIDStr := r.URL.Query().Get("id")
		actionID, err := strconv.Atoi(actionIDStr)
		if err != nil {
			log.Error().Msgf("Invalid id for action delete: %v", err)
			http.Error(w, "Invalid id", http.StatusBadRequest)
			return
		}
		ui.actionsMutex.Lock()
		defer ui.actionsMutex.Unlock()
		actions, _ := ui.loadActions()
		var newActions []hubitatservice.ActionInput
		found := false
		for _, a := range actions {
			if a.DeviceID != actionID {
				newActions = append(newActions, a)
			} else {
				found = true
			}
		}
		if !found {
			log.Error().Msgf("Action with deviceId %d not found for delete", actionID)
			http.Error(w, "Action not found", http.StatusNotFound)
			return
		}
		ui.saveActions(newActions)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Action deleted"))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (ui *UIService) deviceHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "POST":
		mode := r.URL.Query().Get("mode")
		ui.configMutex.Lock()
		defer ui.configMutex.Unlock()
		devices, _ := ui.loadDevices()
		devUrl := r.FormValue("deviceUrl")
		backOff, ok := ui.parseIntField(r.FormValue("deviceBackoff"), "deviceBackoff", w)
		if !ok {
			log.Error().Msg("Failed to parse deviceBackoff")
			http.Error(w, "Invalid deviceBackoff", http.StatusBadRequest)
			return
		}
		if mode == "add" {
			deviceIDStr := r.FormValue("deviceId")
			deviceID, err := strconv.Atoi(deviceIDStr)
			if err != nil {
				log.Error().Msgf("Invalid deviceId for device add: %v", err)
				http.Error(w, "Invalid deviceId", http.StatusBadRequest)
				return
			}
			apiID, ok := ui.parseIntField(r.FormValue("apiId"), "apiId", w)
			if !ok {
				log.Error().Msg("Failed to parse apiID for device add")
				http.Error(w, "Invalid apiID", http.StatusBadRequest)
				return
			}
			devices[deviceIDStr] = hubitatservice.HubitatDeviceInfo{
				DeviceID:      deviceID,
				APIID:         apiID,
				DeviceURL:     &devUrl,
				DeviceBackoff: backOff,
			}
			*ui.UpdateChannel <- UpdateMsg{
				UpdateType: "device",
				UpdateData: devices[deviceIDStr],
			}
			ui.saveDevices(devices)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Device added"))
		} else if mode == "edit" {
			deviceID := r.FormValue("deviceId")
			if dev, ok := devices[deviceID]; ok {
				apiID, ok := ui.parseIntField(r.FormValue("apiId"), "apiId", w)
				if !ok {
					log.Error().Msg("Failed to parse apiID for device edit")
					http.Error(w, "Invalid apiID", http.StatusBadRequest)
					return
				}
				dev.APIID = apiID
				dev.DeviceURL = &devUrl
				dev.DeviceBackoff = backOff
				devices[deviceID] = dev
				*ui.UpdateChannel <- UpdateMsg{
					UpdateType: "device",
					UpdateData: dev,
				}
				ui.saveDevices(devices)
				w.WriteHeader(http.StatusOK)
				w.Write([]byte("Device updated"))
			} else {
				log.Error().Msgf("Device with deviceId %s not found for edit", deviceID)
				http.Error(w, "Device not found", http.StatusNotFound)
				return
			}
		}
	case "DELETE":
		deviceID := r.URL.Query().Get("id")
		if deviceID == "" {
			log.Error().Msg("Missing id for device delete")
			http.Error(w, "Missing id", http.StatusBadRequest)
			return
		}
		ui.configMutex.Lock()
		defer ui.configMutex.Unlock()
		devices, _ := ui.loadDevices()
		if _, ok := devices[deviceID]; !ok {
			log.Error().Msgf("Device with deviceId %s not found for delete", deviceID)
			http.Error(w, "Device not found", http.StatusNotFound)
			return
		}
		delete(devices, deviceID)
		ui.saveDevices(devices)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Device deleted"))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Helper functions to load/save JSON
func (ui *UIService) loadActions() ([]hubitatservice.ActionInput, error) {
	data, err := os.ReadFile(ui.ActionsPath)
	if err != nil {
		return nil, err
	}
	log.Debug().Msgf("file actions:\n%s", ui.prettyJSON(data))
	var actions []hubitatservice.ActionInput
	json.Unmarshal(data, &actions)
	if b, err := json.MarshalIndent(actions, "", "  "); err == nil {
		log.Debug().Msgf("loaded actions:\n%s", b)
	}
	return actions, nil
}

func (ui *UIService) saveActions(actions []hubitatservice.ActionInput) error {
	data, err := json.MarshalIndent(actions, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ui.ActionsPath, data, 0644)
}

func (ui *UIService) loadDevices() (map[string]hubitatservice.HubitatDeviceInfo, error) {
	data, err := os.ReadFile(ui.ConfigPath)
	if err != nil {
		return nil, err
	}
	log.Debug().Msgf("file devices:\n%s", ui.prettyJSON(data))
	var config struct {
		HubitatConfig struct {
			HubitatDevices map[string]hubitatservice.HubitatDeviceInfo `json:"HubitatDevices"`
		} `json:"HubitatConfig"`
	}
	json.Unmarshal(data, &config)
	if b, err := json.MarshalIndent(config, "", "  "); err == nil {
		log.Debug().Msgf("loaded devices:\n%s", b)
	}
	return config.HubitatConfig.HubitatDevices, nil
}

func (ui *UIService) saveDevices(devices map[string]hubitatservice.HubitatDeviceInfo) error {
	data, err := os.ReadFile(ui.ConfigPath)
	if err != nil {
		return err
	}
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return err
	}
	hc, ok := config["HubitatConfig"].(map[string]interface{})
	if !ok {
		return err
	}
	devicesIface := make(map[string]interface{}, len(devices))
	for k, v := range devices {
		b, _ := json.Marshal(v)
		var m map[string]interface{}
		json.Unmarshal(b, &m)
		devicesIface[k] = m
	}
	hc["HubitatDevices"] = devicesIface

	out, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ui.ConfigPath, out, 0644)
}

func (ui *UIService) prettyJSON(data []byte) string {
	var out bytes.Buffer
	err := json.Indent(&out, data, "", "  ")
	if err != nil {
		return string(data)
	}
	return out.String()
}

func (ui *UIService) parseIntField(val string, fieldName string, w http.ResponseWriter) (int, bool) {
	if val == "" {
		log.Error().Msgf("Missing %s", fieldName)
		http.Error(w, "Missing "+fieldName, http.StatusBadRequest)
		return 0, false
	}
	i, err := strconv.Atoi(val)
	if err != nil {
		log.Error().Msgf("Invalid %s: %v", fieldName, err)
		http.Error(w, "Invalid "+fieldName, http.StatusBadRequest)
		return 0, false
	}
	return i, true
}

func (ui *UIService) parseDurationPtr(val string, fieldName string, w http.ResponseWriter) (*time.Duration, bool) {
	if val == "" {
		return nil, true
	}
	d, err := time.ParseDuration(val)
	if err != nil {
		log.Error().Msgf("Invalid %s: %v", fieldName, err)
		http.Error(w, "Invalid "+fieldName, http.StatusBadRequest)
		return nil, false
	}
	return &d, true
}
