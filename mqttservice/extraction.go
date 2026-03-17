package mqttservice

import (
	"encoding/json"
	"time"

	"github.com/rs/zerolog/log"
)

// FrigateEvent matches the structure of the frigate/events MQTT topic
type FrigateEvent struct {
    Type   string `json:"type"` // new, update, end
    Before struct {
        ID     string  `json:"id"`
        Camera string  `json:"camera"`
        Label  string  `json:"label"`
        Box    []int   `json:"box"`
		Region []int   `json:"region"`
        Score  float64 `json:"score"`
        FP     bool    `json:"false_positive"`
    } `json:"before"`
    After struct {
        ID     string  `json:"id"`
        Camera string  `json:"camera"`
        Label  string  `json:"label"`
        Box    []int   `json:"box"`
		Region []int   `json:"region"`
        Score  float64 `json:"score"`
        FP     bool    `json:"false_positive"`
    } `json:"after"`
}

// HouseAIExtraction is the simplified abstraction layer
type HouseAIExtraction struct {
    ID            string  `json:"id"`
    DetectionType string  `json:"type"`
    Location      string  `json:"camera"`
    IsActive      bool    `json:"is_active"`
    BoundingBox   []int   `json:"bounding_box"`    // [x1, y1, x2, y2] in pixels
    RegionSize    []int   `json:"region_size"`     // [width, height] of analyzed region
    Confidence    float64 `json:"confidence"`
    Timestamp     string  `json:"timestamp"`
}


// ExtractFrigateEvent converts a Frigate MQTT message into HouseAIExtraction(s)
func ExtractFrigateEvent(payload []byte) ([]*HouseAIExtraction, error) {
    var event FrigateEvent
    if err := json.Unmarshal(payload, &event); err != nil {
        log.Error().Msgf("failed to unmarshal Frigate event: %v", err)
        return nil, err
    }

    var extractions []*HouseAIExtraction

    // Process before event if present
    if event.Before.Camera != "" {
        extraction := processDetection(event.Before.ID, event.Before.Label, event.Before.Camera, event.Before.Box, event.Before.Region, event.Before.Score, event.Before.FP, "before")
        if extraction != nil {
            extractions = append(extractions, extraction)
        }
    }

    extraction := processDetection(event.After.ID, event.After.Label, event.After.Camera, event.After.Box, event.Before.Region, event.After.Score, event.After.FP, "after")
    if extraction != nil {
        extractions = append(extractions, extraction)
    }

    return extractions, nil
}

// processDetection filters and creates an extraction for a detection
func processDetection(id, label, camera string, box []int, region []int, score float64, fp bool, stage string) *HouseAIExtraction {
    // Filter for confirmed objects of interest
    interestingObjects := map[string]bool{"person": true, "car": true, "motorcycle": true, "bus": true}
    
    if fp {
        log.Debug().Msgf("skipping false positive detection (%s): %s", stage, label)
        return nil
    }
    
    if !interestingObjects[label] {
        log.Debug().Msgf("skipping uninteresting object (%s): %s", stage, label)
        return nil
    }

    log.Debug().Msgf("processing interesting event (%s): %s detected at %s", stage, label, camera)

    // Calculate region dimensions
    regionWidth := region[2] - region[0]   // x2 - x1
    regionHeight := region[3] - region[1]  // y2 - y1

    extraction := &HouseAIExtraction{
        ID:            id,
        DetectionType: label,
        Location:      camera,
        IsActive:      true,
        BoundingBox:   box,
        RegionSize:    []int{regionWidth, regionHeight},
        Confidence:    score,
        Timestamp:     time.Now().Format(time.RFC3339),
    }

    return extraction
}