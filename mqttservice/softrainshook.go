package mqttservice

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"

	mqtt "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/packets"
	"github.com/rs/zerolog/log"
)

// Options contains configuration settings for the hook.
type SoftRainsHookOptions struct {
	Server *mqtt.Server
	AIExtractionsPath string
	SaveAIExtractions bool
}

type SoftRainsHook struct {
	mqtt.HookBase
	config *SoftRainsHookOptions
	writer *ExtractionWriter
}

func (h *SoftRainsHook) ID() string {
	return "softrain"
}

func (h *SoftRainsHook) Provides(b byte) bool {
	return bytes.Contains([]byte{
		mqtt.OnConnect,
		mqtt.OnDisconnect,
		mqtt.OnSubscribed,
		mqtt.OnUnsubscribed,
		mqtt.OnPublished,
		mqtt.OnPublish,
	}, []byte{b})
}

func (h *SoftRainsHook) Init(config any) error {
	log.Info().Msg("softrain hook initialised")
	if _, ok := config.(*SoftRainsHookOptions); !ok && config != nil {
		return mqtt.ErrInvalidConfigType
	}

	h.config = config.(*SoftRainsHookOptions)
	if h.config.Server == nil {
		return mqtt.ErrInvalidConfigType
	}

	return h.initExtractionWriter()
}

func (h *SoftRainsHook) OnConnect(cl *mqtt.Client, pk packets.Packet) error {
	log.Info().Msgf("client connected: %s", cl.ID)
	return nil
}

func (h *SoftRainsHook) OnDisconnect(cl *mqtt.Client, err error, expire bool) {
	if err != nil {
		log.Info().Msgf("client disconnected: %s (expire=%v, error=%v)", cl.ID, expire, err)
	} else {
		log.Info().Msgf("client disconnected: %s (expire=%v)", cl.ID, expire)
	}
}

func (h *SoftRainsHook) OnSubscribed(cl *mqtt.Client, pk packets.Packet, reasonCodes []byte) {
	log.Info().Msgf("client %s subscribed to filters: %v (qos=%v)", cl.ID, pk.Filters, reasonCodes)
}

func (h *SoftRainsHook) OnUnsubscribed(cl *mqtt.Client, pk packets.Packet) {
	log.Info().Msgf("client %s unsubscribed from filters: %v", cl.ID, pk.Filters)
}

func (h *SoftRainsHook) OnPublish(cl *mqtt.Client, pk packets.Packet) (packets.Packet, error) {
	log.Info().Msgf("OnPublish hook - message from client: %s on topic: %s, payload: %s", cl.ID, pk.TopicName, string(pk.Payload))

	pkx := pk
	if string(pk.Payload) == "hello" {
		pkx.Payload = []byte("hello world")
		log.Debug().Msgf("OnPublish hook - modified packet from client: %s, new payload: %s", cl.ID, string(pkx.Payload))
	}

	if isFromFrigateEvents(pk.TopicName) {
		extractions, err := ExtractFrigateEvent(pk.Payload)
		if err != nil {
			log.Error().Msgf("failed to extract Frigate event: %v", err)
			return pkx, nil
		}

		for _, extraction := range extractions {
			log.Info().Msgf("successfully extracted HouseAI event: type=%s, location=%s, active=%v", extraction.DetectionType, extraction.Location, extraction.IsActive)
			h.writeExtractionIfEnabled(extraction)
		}
	}

	log.Info().Msgf("OnPublish hook - returning packet to be distributed on topic: %s", pkx.TopicName)
	return pkx, nil
}

func (h *SoftRainsHook) OnPublished(cl *mqtt.Client, pk packets.Packet) {
	log.Debug().Msgf("published to client: %s, payload: %s", cl.ID, string(pk.Payload))
}

// isFromFrigate checks if the topic is a Frigate event topic
func isFromFrigate(topic string) bool {
	return strings.Contains(topic, "frigate")
}

// isFromFrigateEvents checks if the topic is a Frigate events topic
func isFromFrigateEvents(topic string) bool {
	return strings.Contains(topic, "frigate/events")
}

const maxFileSize = 20 * 1024 * 1024 // 20 MB

// ExtractionWriter handles writing extractions to file
type ExtractionWriter struct {
	filepath string
	mu       sync.Mutex
	file     *os.File
}

// NewExtractionWriter creates a new extraction writer
func NewExtractionWriter(filepath string) (*ExtractionWriter, error) {
	file, err := os.OpenFile(filepath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	return &ExtractionWriter{
		filepath: filepath,
		file:     file,
	}, nil
}

// WriteExtraction writes an extraction to file, rotating if needed
func (w *ExtractionWriter) WriteExtraction(extraction *HouseAIExtraction) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Check file size and rotate if necessary
	fileInfo, err := w.file.Stat()
	if err != nil {
		return err
	}

	if fileInfo.Size() >= maxFileSize {
		log.Info().Msgf("extraction file reached %d bytes, rotating", fileInfo.Size())
		if err := w.rotateFile(); err != nil {
			return err
		}
	}

	// Write extraction as JSON line
	data, err := json.Marshal(extraction)
	if err != nil {
		return err
	}

	_, err = w.file.Write(append(data, '\n'))
	if err != nil {
		return err
	}

	return w.file.Sync()
}

// rotateFile closes current file and creates a new one
func (w *ExtractionWriter) rotateFile() error {
	if err := w.file.Close(); err != nil {
		return err
	}

	// Rename old file with timestamp
	timestamp := time.Now().Format("20060102_150405")
	backupPath := w.filepath + "." + timestamp
	if err := os.Rename(w.filepath, backupPath); err != nil {
		log.Warn().Msgf("failed to rename old extraction file: %v", err)
	}

	// Create new file
	file, err := os.OpenFile(w.filepath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}

	w.file = file
	log.Info().Msgf("created new extraction file: %s (old file backed up to: %s)", w.filepath, backupPath)
	return nil
}

// Close closes the file
func (w *ExtractionWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.file.Close()
}

func (h *SoftRainsHook) initExtractionWriter() error {
	if !h.config.SaveAIExtractions || h.config.AIExtractionsPath == "" {
		return nil
	}

	writer, err := NewExtractionWriter(h.config.AIExtractionsPath)
	if err != nil {
		log.Error().Msgf("failed to create extraction writer: %v", err)
		return err
	}

	h.writer = writer
	log.Info().Msgf("extraction writer enabled, storing to: %s", h.config.AIExtractionsPath)
	return nil
}

func (h *SoftRainsHook) writeExtractionIfEnabled(extraction *HouseAIExtraction) {
	if !h.config.SaveAIExtractions || h.writer == nil {
		return
	}
	if err := h.writer.WriteExtraction(extraction); err != nil {
		log.Error().Msgf("failed to write extraction to file: %v", err)
	}
}
