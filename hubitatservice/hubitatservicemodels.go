package hubitatservice

import "time"

type HubitatServiceConfig struct {
	HubitatDevices       map[int]HubitatDeviceInfo `json:"HubitatDevices"`
	TimeoutSeconds       int                       `json:"TimeoutSeconds"`
	DeviceBackoffEnabled bool                      `json:"DeviceBackoffEnabled"`
	ActionsListLocation  string                    `json:"ActionsListLocation"`
}

type HubitatDeviceInfo struct {
	DeviceID      int     `json:"DeviceId"`
	APIID         int     `json:"APIId"`
	DeviceURL     *string `json:"DeviceURL"`
	PostBody      *string `json:"PostBody"`
	DeviceBackoff int     `json:"DeviceBackoff"`
}

type ActionType struct {
	DeviceId        int
	PrimaryAction   string
	SecondaryAction string
	StartDelay      time.Duration
	BackoffDelay    time.Duration
	CurrentDelay    time.Time
}

type HubitatService struct {
	AutomaticAction        map[string]ActionType
	HubitatDeviceList      map[int]HubitatDeviceInfo
	HubitatChannel         *chan []ActionType
	UpdateChannel          *chan HubitatDeviceInfo
	DeviceBackoff          map[int]time.Time
	Timeout                int
	DeviceBackoffEnabled   bool
	DefaultBackoffInterval int
}

type ActionInput struct {
	DeviceID        int            `json:"deviceId"`
	Delay           int            `json:"delay"`
	PrimaryAction   string         `json:"primaryAction"`
	SecondaryAction string         `json:"secondaryAction"`
	CameraSource    string         `json:"cameraSource"`
	Backoff         *time.Duration `json:"backoff"`
}
