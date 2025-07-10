# SoftRains  

SoftRains bridges Frigate's AI camera tracking with Hubitat's home automation, enabling AI-driven detection in a device-agnostic, air-gapped environment. 

The toolkit was inspired by the works of Ray Bradbury, particularly the stories "The Veldt" and "What Soft Rains May Come." 

---

## Configuration: `config/softrains.json`

The `softrains.json` file is the core configuration for SoftRains. Below is a breakdown of its structure:

```json  
{  
  "LogLevel": "info",  
  "HubitatConfig": {  
    "HubitatDevices": [  
      {  
        "DeviceId": 1,  
        "APIId": 101,  
        "DeviceURL": "http://example.com/device1",  
        "PostBody": "{\"action\":\"<action2>\"}",  
        "DeviceBackoff": 30,  
        "HubitatURL": "http://example.com/hubitat"  
      },  
      {  
        "DeviceId": 2,  
        "APIId": 102,  
        "DeviceURL": "http://example.com/device2",  
        "PostBody": "{\"action\":\"<action2>\"}",  
        "DeviceBackoff": 60,  
        "HubitatURL": "http://example.com/hubitat"  
      }  
    ],  
    "TimeoutSeconds": 10,  
    "DeviceBackoffEnabled": true,  
    "ActionsListLocation": "/path/to/actions.json"  
  },  
  "FrigateService": {  
    "MqttURL": "mqtt://broker.local",  
    "MqttPort": "1883",  
    "FrigateTopics": [  
      "frigate/events",  
      "frigate/tracked_object_update"  
    ]  
  }  
}  
```

### `softrains.json` Key Fields

- **LogLevel**: Sets the global logging level for the application (e.g., `"info"`, `"debug"`).
- **HubitatConfig**: Configuration for Hubitat's API.
  - **HubitatDevices**: List of devices connected to Hubitat.
    - `DeviceId`: Unique ID for the device.
    - `APIId`: Hubitat DeviceAPI API-specific ID for the device.
    - `DeviceURL`: URL for the device's API endpoint.
    - `PostBody`: JSON payload for device actions.
    - `DeviceBackoff`: Backoff time in seconds for the device.
    - `HubitatURL`: Base URL for the Hubitat server.
  - **TimeoutSeconds**: Timeout for Hubitat API requests.
  - **DeviceBackoffEnabled**: Enables or disables device backoff.
  - **ActionsListLocation**: Path to the JSON file containing action mappings.
- **FrigateService**: Configuration for Frigate's API and MQTT.
  - **MqttURL**: URL for the MQTT broker.
  - **MqttPort**: Port for the MQTT broker.
  - **FrigateTopics**: List of MQTT topics to subscribe to.

---

## Action Mapping: `config/actions.json`

The `actions.json` file defines the mapping between detected events (such as objects or people) and the actions to be triggered on your Hubitat devices. Each entry in this file represents a single automation rule.

```json
[
  {
    "deviceId": 101,
    "delay": 0,
    "primaryAction": "on",
    "secondaryAction": "",
    "cameraSource": "FrontDoor:person",
    "backoff": 2
  },
  {
    "deviceId": 202,
    "delay": 30,
    "primaryAction": "close",
    "secondaryAction": "",
    "cameraSource": "Garage:car",
    "backoff": 5
  },
  {
    "deviceId": 303,
    "delay": 0,
    "primaryAction": "notify",
    "secondaryAction": "BackYard:dog",
    "cameraSource": "BackYard:dog",
    "backoff": 0
  }
]
```

### `actions.json` Key Fields

- **deviceId**: The Hubitat device ID to control (must match a device in your `softrains.json`).
- **delay**: Number of seconds to wait before performing the action after the event is detected.
- **primaryAction**: The main action to perform (e.g., `"on"`, `"off"`, `"open"`, `"close"`, `"notify"`).
- **secondaryAction**: An optional secondary action or context (can be left as an empty string if unused).
- **cameraSource**: The camera and object type that triggers this action, formatted as `"CameraName:objectType"` (e.g., `"FrontDoor:person"`). For our this specific implementation, it is a mapping of the detection zone from frigate with the object type based on how frigate is configured and is parsed in the mqttservice code.
- **backoff**: Minimum number of seconds before this action can be triggered again for the same device.

### Example Usage

If Frigate detects a person at the front door camera, and the corresponding action in `actions.json` has `"primaryAction": "on"` for `deviceId` 101, SoftRains will send the "on" command to device 101 immediately (since `"delay": 0`). If another detection occurs within the `"backoff"` period, the action will not be triggered again until the backoff expires.

---

**Tips:**  
- Ensure that every `deviceId` in `actions.json` matches a device defined in your `softrains.json` configuration.
- You can define as many action rules as needed to automate your environment.

---

## Quickstart

### Quickstart: SoftRains Smoke Test

1. **Build the Project:**  
     Run the following command to build the binary:  
     ```bash
     make build
     ```

2. **Execute the Binary:**  
     Run the resulting binary directly:  
     ```bash
     ./softrains
     ```

SoftRains will start monitoring Frigate events and trigger Hubitat automations based on your configuration.

---

### Quickstart: Full Frigate Stack with Coral (Docker Compose)

This section describes how to run the full stack, including Frigate (with Google Coral support) and SoftRains, using Docker Compose.

#### 1. **Clone the Repository**

```bash
git clone https://github.com/yourusername/softrains.git
cd softrains
```

#### 2. **Create and Edit the `.env` File**

Create a `.env` file in the root of your repository with the following variables.  
**You must source your tokens and secrets from your own secure location.**

```env
# .env file example
FRIGATE_CONFIG_DIR=/path/to/your/frigate/config
FRIGATE_MEDIA_DIR=/path/to/your/frigate/media
FRIGATE_RTSP_PASSWORD=your_rtsp_password
PLUS_API_KEY=your_plus_api_key
SOFTRAINS_CONFIG_DIR=/path/to/your/softrains/config
HUBITAT_ACCESS_TOKEN_52=your_hubitat_token_52
HUBITAT_ACCESS_TOKEN_132=your_hubitat_token_132
```

#### 3. **Update Configuration Files**

- Edit `config/softrains.json` and `config/actions.json` as described above to match your environment.
- Make sure the paths in your `.env` file match the locations of your configuration and media directories.

#### 4. **Start the Stack**

```bash
cd docker-compose
docker-compose up -d
```

This will start both the `softrains` (controller) and `frigate` services.  
The `frigate` service will wait for `softrains` to be healthy before starting.

#### 5. **Verify Operation**

- Access the SoftRains UI at [https://localhost:8443](https://localhost:8443) (or your configured port).
- Access the Frigate UI at [http://localhost:8971](http://localhost:8971) (or your configured port).

---

**Notes:**
- The Coral USB accelerator should be plugged in and accessible to the Frigate container for hardware acceleration.
- All tokens and secrets should be managed securely and never committed to version control.
- For production deployments, ensure your certificates and keys are valid and securely stored.

---