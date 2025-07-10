package controller

import (
	"github.com/bigjimnolan/softrains/frigateservice"
	"github.com/bigjimnolan/softrains/hubitatservice"
	"github.com/bigjimnolan/softrains/mqttservice"
	"github.com/bigjimnolan/softrains/uiservice"
)

// SoftRainsConfig is the configuration structure for the SoftRains application
// It contains the log level, Hubitat configuration, and Frigate service configuration.
type SoftRainsConfig struct {
	LogLevel       string                              `json:"LogLevel"`
	HubitatConfig  hubitatservice.HubitatServiceConfig `json:"HubitatConfig"`
	FrigateService frigateservice.FrigateService       `json:"FrigateService"`
	MQTTService    mqttservice.MQTTService             `json:"MQTTService"`
	UIService      uiservice.UIService                 `json:"UIService"`
}
