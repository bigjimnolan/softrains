package frigateservice

type Event struct {
	Before EventDetails `json:"before"`
	After  EventDetails `json:"after"`
	Type   string       `json:"type"`
}

type EventDetails struct {
	ID                string                 `json:"id"`
	Camera            string                 `json:"camera"`
	FrameTime         float64                `json:"frame_time"`
	Snapshot          *Snapshot              `json:"snapshot"` // Pointer to handle null values
	Label             string                 `json:"label"`
	SubLabel          *string                `json:"sub_label"` // Pointer to handle null values
	TopScore          float64                `json:"top_score"`
	FalsePositive     bool                   `json:"false_positive"`
	StartTime         float64                `json:"start_time"`
	EndTime           *float64               `json:"end_time"` // Pointer to handle null values
	Score             float64                `json:"score"`
	Box               []int                  `json:"box"`
	Area              int                    `json:"area"`
	Ratio             float64                `json:"ratio"`
	Region            []int                  `json:"region"`
	Active            bool                   `json:"active"`
	Stationary        bool                   `json:"stationary"`
	MotionlessCount   int                    `json:"motionless_count"`
	PositionChanges   int                    `json:"position_changes"`
	CurrentZones      []string               `json:"current_zones"`
	EnteredZones      []string               `json:"entered_zones"`
	HasClip           bool                   `json:"has_clip"`
	HasSnapshot       bool                   `json:"has_snapshot"`
	Attributes        map[string]interface{} `json:"attributes"`
	CurrentAttributes []interface{}          `json:"current_attributes"`
	PendingLoitering  bool                   `json:"pending_loitering"`
	MaxSeverity       string                 `json:"max_severity"`
}

type Snapshot struct {
	FrameTime  float64       `json:"frame_time"`
	Box        []int         `json:"box"`
	Area       int           `json:"area"`
	Region     []int         `json:"region"`
	Score      float64       `json:"score"`
	Attributes []interface{} `json:"attributes"`
}

type FrigateService struct {
	MqttURL       string
	MqttPort      string
	FrigateTopics []string
}
