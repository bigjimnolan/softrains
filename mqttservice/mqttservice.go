// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2022 mochi-mqtt, mochi-co
// SPDX-FileContributor: mochi-co

package mqttservice

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/rs/zerolog/log"

	mqtt "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
)

type MQTTService struct {
	ID      string `json:"ID"`
	Address string `json:"Address"`
}

func (mqt MQTTService) Start() error {
	sigs := make(chan os.Signal, 1)
	done := make(chan bool, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigs
		done <- true
	}()

	server := mqtt.New(&mqtt.Options{
		InlineClient: true, // you must enable inline client to use direct publishing and subscribing.
	})

	_ = server.AddHook(new(auth.AllowHook), nil)
	log.Info().Msgf("Starting MQTT server on %s %s", mqt.ID, mqt.Address)
	tcp := listeners.NewTCP(listeners.Config{
		ID:      mqt.ID,
		Address: mqt.Address,
	})
	err := server.AddListener(tcp)
	if err != nil {
		return err
	}

	// Add custom hook (SoftRainsHook) to the server
	err = server.AddHook(new(SoftRainsHook), &SoftRainsHookOptions{
		Server: server,
	})

	if err != nil {
		return err
	}

	// Start the server
	go func() {
		err := server.Serve()
		if err != nil {
			log.Fatal().Msgf("Error serving mqtt: %v", err)
		}
	}()

	<-done
	server.Log.Warn("caught signal, stopping...")
	err = server.Close()
	server.Log.Info("server.go finished")
	return err
}
