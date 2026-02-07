package uiservice

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"html/template"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/bigjimnolan/softrains/hubitatservice"
	"github.com/rs/zerolog/log"
)

type UIService struct {
	Actions          []hubitatservice.ActionInput
	Devices          map[string]hubitatservice.HubitatDeviceInfo
	ActionsPath      string
	ConfigPath       string
	ServerKeyPath    string
	ServerCertPath   string
	TLSListenPort    string
	WebFolderDocRoot string
	authPassword     string
	actionsMutex     sync.Mutex
	configMutex      sync.Mutex
	UpdateChannelOut *chan UpdateMsg
	UpdateChannelIn  *chan UpdateMsg
	GoogleMapsAPIKey string
}

type UpdateMsg struct {
	UpdateType string      `json:"updateType"`
	UpdateData interface{} `json:"updateData"`
}

func (ui *UIService) Start() error {
	// Start update channel listener
	ui.loadActions()
	ui.loadDevices()

	// Start the update listener in a separate goroutine
	go ui.listenForUpdates()
	
	ui.authPassword = os.Getenv("SOFTRAINS_AUTH_PASSWORD")
	ui.GoogleMapsAPIKey = os.Getenv("GOOGLE_MAPS_API_KEY")
	http.HandleFunc("/", ui.loginHandler)

	// Serve static content without authentication
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(ui.WebFolderDocRoot+"static"))))

	// Proxy routes for cam2hub service (CORS-enabled) - MUST be before /api route
	http.HandleFunc("/api/cam2hub/login", ui.cam2hubLoginProxy)
	http.HandleFunc("/api/cam2hub/snapshot", ui.cam2hubSnapshotProxy)

	// Auth-protected routes
	http.HandleFunc("/dashboard", ui.authMiddleware(ui.dashboardHandler))
	http.HandleFunc("/maps", ui.authMiddleware(ui.mapsHandler))
	http.HandleFunc("/api", ui.authMiddleware(ui.apiHandler))
	http.HandleFunc("/action", ui.authMiddleware(ui.actionHandler))
	http.HandleFunc("/device", ui.authMiddleware(ui.deviceHandler))

	// TLS checks and server setup
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

// Serve maps.html with injected Actions and Devices data (like dashboardHandler)
func (ui *UIService) mapsHandler(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.ParseFiles(ui.WebFolderDocRoot + "templates/maps.html"))

	actionsJSON, err := json.Marshal(ui.Actions)
	if err != nil {
		http.Error(w, "Error marshaling actions", http.StatusInternalServerError)
		return
	}
	devicesJSON, err := json.Marshal(ui.Devices)
	if err != nil {
		http.Error(w, "Error marshaling devices", http.StatusInternalServerError)
		return
	}

	err = tmpl.Execute(w, map[string]interface{}{
		"ActionsJSON":      template.JS(actionsJSON), // Mark as JS-safe
		"DevicesJSON":      template.JS(devicesJSON), // Mark as JS-safe
		"GoogleMapsAPIKey": ui.GoogleMapsAPIKey,
	})
	if err != nil {
		http.Error(w, "Error rendering maps", http.StatusInternalServerError)
		log.Error().Msgf("Error rendering maps: %v", err)
		return
	}
	log.Debug().Msgf("Maps rendered with %d ui.Actions and %d ui.Devices", len(ui.Actions), len(ui.Devices))
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

	actionsJSON, err := json.Marshal(ui.Actions)
	if err != nil {
		http.Error(w, "Error marshaling actions", http.StatusInternalServerError)
		return
	}
	devicesJSON, err := json.Marshal(ui.Devices)
	if err != nil {
		http.Error(w, "Error marshaling devices", http.StatusInternalServerError)
		return
	}

	err = tmpl.Execute(w, map[string]interface{}{
		"ActionsJSON": template.JS(actionsJSON), // Mark as JS-safe
		"DevicesJSON": template.JS(devicesJSON), // Mark as JS-safe
	})
	if err != nil {
		http.Error(w, "Error rendering dashboard", http.StatusInternalServerError)
		log.Error().Msgf("Error rendering dashboard: %v", err)
		return
	}
	log.Debug().Msgf("Dashboard rendered with %d ui.Actions and %d ui.Devices", len(ui.Actions), len(ui.Devices))
}

func (ui *UIService) apiHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case "GET":
		command := r.URL.Query().Get("command")
		switch command {
		case "getAll":
			ui.actionsMutex.Lock()
			actionsCopy := make([]hubitatservice.ActionInput, len(ui.Actions))
			copy(actionsCopy, ui.Actions)
			ui.actionsMutex.Unlock()

			ui.configMutex.Lock()
			devicesCopy := make(map[string]hubitatservice.HubitatDeviceInfo, len(ui.Devices))
			for k, v := range ui.Devices {
				devicesCopy[k] = v
			}
			ui.configMutex.Unlock()
			// response is both actions and devices
			response := map[string]interface{}{
				"actions": actionsCopy,
				"devices": devicesCopy,
			}
			json.NewEncoder(w).Encode(response)
			log.Debug().Msg("API GET updateAll called")
			return
		default:
			http.Error(w, "Unknown command", http.StatusBadRequest)
			return
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (ui *UIService) actionHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "POST":
		mode := r.URL.Query().Get("mode")
		ui.actionsMutex.Lock()
		defer ui.actionsMutex.Unlock()
		switch mode {
		case "add":
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
			ui.Actions = append(ui.Actions, newAction)
			err := ui.saveActions()
			if err != nil {
				log.Error().Msgf("Failed to save ui.Actions: %v", err)
				http.Error(w, "Failed to save ui.Actions", http.StatusInternalServerError)
				return
			}
			*ui.UpdateChannelOut <- UpdateMsg{
				UpdateType: "action",
				UpdateData: newAction,
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Action added"))
		case "edit":
			actionID, ok := ui.parseIntField(r.FormValue("deviceId"), "deviceId", w)
			if !ok {
				log.Error().Msg("Failed to parse deviceId for action edit")
				http.Error(w, "Invalid deviceId", http.StatusBadRequest)
				return
			}
			found := false
			for i, a := range ui.Actions {
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
					ui.Actions[i].Delay = delay
					ui.Actions[i].PrimaryAction = r.FormValue("primaryAction")
					ui.Actions[i].SecondaryAction = r.FormValue("secondaryAction")
					ui.Actions[i].CameraSource = r.FormValue("cameraSource")
					ui.Actions[i].Backoff = backoffPtr
					*ui.UpdateChannelOut <- UpdateMsg{
						UpdateType: "action",
						UpdateData: ui.Actions[i],
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
			err := ui.saveActions()
			if err != nil {
				log.Error().Msgf("Failed to save ui.Actions: %v", err)
				http.Error(w, "Failed to save ui.Actions", http.StatusInternalServerError)
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

		var newActions []hubitatservice.ActionInput
		found := false
		for _, a := range ui.Actions {
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
		ui.saveActions()
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
		devUrl := r.FormValue("deviceUrl")
		backOff, ok := ui.parseIntField(r.FormValue("deviceBackoff"), "deviceBackoff", w)
		if !ok {
			log.Error().Msg("Failed to parse deviceBackoff")
			http.Error(w, "Invalid deviceBackoff", http.StatusBadRequest)
			return
		}
		switch mode {
		case "add":
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
			ui.Devices[deviceIDStr] = hubitatservice.HubitatDeviceInfo{
				DeviceID:      deviceID,
				APIID:         apiID,
				DeviceURL:     &devUrl,
				DeviceBackoff: backOff,
			}
			*ui.UpdateChannelOut <- UpdateMsg{
				UpdateType: "device",
				UpdateData: ui.Devices[deviceIDStr],
			}
			ui.saveDevices()
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Device added"))
		case "edit":
			deviceID := r.FormValue("deviceId")
			if dev, ok := ui.Devices[deviceID]; ok {
				apiID, ok := ui.parseIntField(r.FormValue("apiId"), "apiId", w)
				if !ok {
					log.Error().Msg("Failed to parse apiID for device edit")
					http.Error(w, "Invalid apiID", http.StatusBadRequest)
					return
				}
				dev.APIID = apiID
				dev.DeviceURL = &devUrl
				dev.DeviceBackoff = backOff
				ui.Devices[deviceID] = dev
				*ui.UpdateChannelOut <- UpdateMsg{
					UpdateType: "device",
					UpdateData: dev,
				}
				ui.saveDevices()
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
		if _, ok := ui.Devices[deviceID]; !ok {
			log.Error().Msgf("Device with deviceId %s not found for delete", deviceID)
			http.Error(w, "Device not found", http.StatusNotFound)
			return
		}
		delete(ui.Devices, deviceID)
		ui.saveDevices()
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
	log.Debug().Msgf("file ui.Actions:\n%s", ui.prettyJSON(data))

	json.Unmarshal(data, &ui.Actions)
	if b, err := json.MarshalIndent(ui.Actions, "", "  "); err == nil {
		log.Debug().Msgf("loaded ui.Actions:\n%s", b)
	}
	return ui.Actions, nil
}

func (ui *UIService) saveActions() error {
	data, err := json.MarshalIndent(ui.Actions, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := ui.ActionsPath + ".tmp"
	err = os.WriteFile(tmpPath, data, 0644)
	if err != nil {
		return err
	}
	return os.Rename(tmpPath, ui.ActionsPath)
	
}

func (ui *UIService) loadDevices() error {
	data, err := os.ReadFile(ui.ConfigPath)
	if err != nil {
		return err
	}
	log.Debug().Msgf("file devices:\n%s", ui.prettyJSON(data))
	var config struct {
		HubitatConfig struct {
			HubitatDevices map[string]hubitatservice.HubitatDeviceInfo `json:"HubitatDevices"`
		} `json:"HubitatConfig"`
	}
	err = json.Unmarshal(data, &config)
	if err != nil {
		return err
	}
	log.Debug().Msgf("loaded devices:\n%v", config.HubitatConfig.HubitatDevices)
	ui.Devices = config.HubitatConfig.HubitatDevices
	return nil
}

func (ui *UIService) saveDevices() error {
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
	}Connection to 192.168.68.91 closed.
bigjim@bigjim:~/Repos$ ssh officepi 

	devicesIface := make(map[string]interface{}, len(ui.Devices))
	for k, v := range ui.Devices {
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
	tmpPath := ui.ConfigPath + ".tmp"
	err = os.WriteFile(tmpPath, out, 0644)
	if err != nil {
		return err
	}Connection to 192.168.68.91 closed.
bigjim@bigjim:~/Repos$ ssh officepi 

	return os.Rename(tmpPath, ui.ConfigPath)
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

func (ui *UIService) listenForUpdates() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case update := <-*ui.UpdateChannelIn:
			log.Info().Msgf("UIService received update: %v", update)
			switch update.UpdateType {
			case "action":
				action, ok := update.UpdateData.(hubitatservice.ActionInput)
				if !ok {
					log.Error().Msg("Invalid action update data")
					continue
				}
				ui.actionsMutex.Lock()
				found := false
				for i, a := range ui.Actions {
					if a.DeviceID == action.DeviceID {
						// Only update fields that are non-zero or non-empty in the update
						if action.Delay != 0 {
							ui.Actions[i].Delay = action.Delay
						}
						if action.PrimaryAction != "" {
							ui.Actions[i].PrimaryAction = action.PrimaryAction
						}
						if action.SecondaryAction != "" {
							ui.Actions[i].SecondaryAction = action.SecondaryAction
						}
						if action.CameraSource != "" {
							ui.Actions[i].CameraSource = action.CameraSource
						}
						if action.Backoff != nil {
							ui.Actions[i].Backoff = action.Backoff
						}
						found = true
						break
					}
				}
				if !found {
					ui.Actions = append(ui.Actions, action)
				}
				ui.saveActions()
				ui.actionsMutex.Unlock()
			case "device":
				device, ok := update.UpdateData.(hubitatservice.HubitatDeviceInfo)
				if !ok {
					log.Error().Msg("Invalid device update data")
					continue
				}
				ui.configMutex.Lock()
				key := strconv.Itoa(device.DeviceID)
				existing, exists := ui.Devices[key]
				if exists {
					// Only update fields that are non-zero or non-empty in the update
					if device.APIID != 0 {
						existing.APIID = device.APIID
					}
					if device.DeviceURL != nil && *device.DeviceURL != "" {
						existing.DeviceURL = device.DeviceURL
					}
					if device.DeviceBackoff != 0 {
						existing.DeviceBackoff = device.DeviceBackoff
					}
					ui.Devices[key] = existing
				} else {
					ui.Devices[key] = device
				}
				// Update LastTrigger if present in update
				dev := ui.Devices[key]
				dev.LastTrigger = update.UpdateData.(hubitatservice.HubitatDeviceInfo).LastTrigger
				ui.Devices[key] = dev
				ui.saveDevices()
				ui.configMutex.Unlock()
			default:
				log.Error().Msgf("Unknown update type: %s", update.UpdateType)
			}
		case <-ticker.C:
			ui.actionsMutex.Lock()
			numActions := len(ui.Actions)
			ui.actionsMutex.Unlock()
			ui.configMutex.Lock()
			numDevices := len(ui.Devices)
			ui.configMutex.Unlock()
			log.Info().Msgf("UIService status: %d devices, %d actions", numDevices, numActions)
		}
	}
}

// cam2hubLoginProxy forwards login requests to cam2hub service with CORS headers
func (ui *UIService) cam2hubLoginProxy(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(httConnection to 192.168.68.91 closed.
bigjim@bigjim:~/Repos$ ssh officepi 
p.StatusOK)
		return
	}

	// Only allow POST
	if r.Method != "POST"Connection to 192.168.68.91 closed.
bigjim@bigjim:~/Repos$ ssh officepi 
 {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read request body
	var loginBody map[string]string
	if err := json.NewDecoder(r.Body).Decode(&loginBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Create a client that skips TLS verification (adjust if needed)
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		Timeout: 10 * time.Second,
	}

	// Forward request to cam2hub service
	bodyBytes, _ := json.Marshal(loginBody)
	proxyReq, err := http.NewRequest("POST", "https://cam2hub.local:8971/login", bytes.NewBuffer(bodyBytes))
	if err != nil {
		log.Error().Msgf("Error creating proxy request: %v", err)
		http.Error(w, "Proxy error", http.StatusInternalServerError)
		return
	}
	proxyReq.Header.Set("Content-Type", "application/json")

	// Send the request
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Error().Msgf("Error forwarding login request: %v", err)
		http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	// Copy response headers (excluding Content-Length to let Go recalculate)
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	// Copy cookies from cam2hub response
	for _, cookie := range resp.Cookies() {
		// Store the JWT cookie but modify path/domain if needed
		cookie.Path = "/"
		cookie.Domain = ""
		http.SetCookie(w, cookie)
	}

	// Write response status and body
	w.WriteHeader(resp.StatusCode)
	json.NewEncoder(w).Encode(loginBody)
}

// cam2hubSnapshotProxy forwards snapshot requests to cam2hub service
func (ui *UIService) cam2hubSnapshotProxy(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Only allow GET
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get eventID from query parameters
	eventID := r.URL.Query().Get("eventId")
	if eventID == "" {
		http.Error(w, "Missing eventId parameter", http.StatusBadRequest)
		return
	}

	// Create a client that skips TLS verification
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		Timeout: 10 * time.Second,
	}

	// Build the cam2hub snapshot URL
	snapshotURL := "https://cam2hub.local:8971/api/events/" + eventID + "/snapshot.jpg"

	// Create and send the request
	proxyReq, err := http.NewRequest("GET", snapshotURL, nil)
	if err != nil {
		log.Error().Msgf("Error creating snapshot proxy request: %v", err)
		http.Error(w, "Proxy error", http.StatusInternalServerError)
		return
	}

	// Forward any auth cookies
	for _, cookie := range r.Cookies() {
		proxyReq.AddCookie(cookie)
	}

	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Error().Msgf("Error forwarding snapshot request: %v", err)
		http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	// Set appropriate content type
	w.Header().Set("Content-Type", "image/jpeg")

	// Write response status and body
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		log.Error().Msgf("Error writing snapshot response: %v", err)
	}
}

