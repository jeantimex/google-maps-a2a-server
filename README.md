# Google Maps A2A Server

This project implements an Agent-to-Agent (A2A) server using Node.js and Express. It acts as a bridge, exposing various Google Maps Platform APIs as skills that can be consumed by A2A clients according to the [A2A Protocol Specification](https://google.github.io/A2A/).

This allows other AI agents or applications to easily leverage Google Maps functionalities like geocoding, directions, place searches, etc., through a standardized interface without needing direct access to the Google Maps API key or implementation details.

## A2A Protocol Interaction

This server follows the A2A protocol:

1.  **Agent Card Discovery:**
    *   Clients can discover the agent's capabilities by fetching the Agent Card from:
        ```http
        GET http://localhost:3000/.well-known/agent.json
        ```
    *   This JSON file describes the agent, its skills (including input/output schemas), and the A2A endpoint URL.

2.  **Task Execution (Synchronous):**
    *   To execute a skill, send a `POST` request to the task endpoint:
        ```http
        POST http://localhost:3000/a2a/tasks/send
        ```
    *   The request body must be a JSON object conforming to the A2A `Task` structure, specifically needing:
        *   `taskId`: A unique identifier for this task request (client-generated).
        *   `messages`: An array containing at least one message.
        *   The first message should have `role: 'user'` and contain a `parts` array.
        *   One of the parts in the first message must be a `dataPart` containing:
            *   `mimeType: "application/json"`
            *   `jsonData`: An object with:
                *   `toolName`: The name of the skill to execute (e.g., `"maps_geocode"`).
                *   `arguments`: An object containing the arguments required by that skill (matching the input schema in the Agent Card).

    *   **Success Response (HTTP 200):**
        *   Returns a JSON `Task` object with `status: "completed"`.
        *   The results of the skill execution will be in the `artifacts` array. Each artifact contains a `parts` array, typically with one `dataPart` holding the JSON result.

    *   **Error Response (HTTP 4xx or 5xx):**
        *   Returns a JSON `Task` object with `status: "failed"`.
        *   Details about the error will be in the `error` object within the response (e.g., `{ "message": "Error details..." }`).

## Features / Supported Skills

This server exposes the following Google Maps APIs as A2A skills:

*   **`maps_geocode`**: Convert a street address into geographic coordinates (latitude, longitude).
    *   Input: `address` (string)
    *   Output: `location`, `formatted_address`, `place_id`
*   **`maps_reverse_geocode`**: Convert geographic coordinates into a human-readable address.
    *   Input: `latitude`, `longitude` (numbers)
    *   Output: `formatted_address`, `place_id`, `address_components`
*   **`maps_search_places`**: Search for places based on a text query (e.g., "restaurants in New York"). Supports optional location biasing.
    *   Input: `query` (string), optionally `location` (object), `radius` (number)
    *   Output: Array of `places` with details like `name`, `formatted_address`, `location`, `place_id`, etc.
*   **`maps_place_details`**: Get detailed information about a specific place using its Place ID.
    *   Input: `place_id` (string)
    *   Output: Detailed place information including `name`, `address`, `phone number`, `website`, `rating`, `reviews`, `opening hours`, etc.
*   **`maps_distance_matrix`**: Calculate travel distance and duration between one or more origins and destinations.
    *   Input: `origins` (array of strings), `destinations` (array of strings), optionally `mode` (string: "driving", "walking", "bicycling", "transit")
    *   Output: Matrix of `results` containing `distance` and `duration` for each origin-destination pair.
*   **`maps_elevation`**: Get elevation data for one or more locations.
    *   Input: `locations` (array of {latitude, longitude} objects)
    *   Output: Array of `results` containing `elevation`, `location`, and `resolution`.
*   **`maps_directions`**: Get step-by-step directions between an origin and a destination.
    *   Input: `origin` (string), `destination` (string), optionally `mode` (string: "driving", "walking", "bicycling", "transit")
    *   Output: Array of `routes` including `summary`, `distance`, `duration`, and detailed `steps`.

## Prerequisites

*   **Node.js:** (LTS version recommended)
*   **npm** or **yarn:** Package manager for Node.js.
*   **Git:** For cloning the repository.
*   **Google Maps API Key:** You need a valid API key from the [Google Cloud Platform (GCP) Console](https://console.cloud.google.com/).
    *   **Important:** Ensure your API key is associated with a GCP project that has **Billing Enabled**.
    *   You **must** enable the following APIs in your GCP project for this server to function correctly:
        *   Directions API
        *   Distance Matrix API
        *   Elevation API
        *   Geocoding API
        *   Places API

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/jeantimex/google-maps-a2a-server.git
    cd google-maps-a2a-server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Create Environment File:**
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    *(Note: You might need to create the `.env.example` file first if it doesn't exist. It should just contain `GOOGLE_MAPS_API_KEY=`)*

4.  **Configure API Key:**
    Open the newly created `.env` file and add your Google Maps API key:
    ```
    GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE
    ```
    Replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` with your actual key.

    **⚠️ Security Warning:** The `.env` file contains your secret API key. It is included in `.gitignore` and **must not** be committed to version control.

5.  **Ensure APIs are Enabled:** Double-check that you have enabled the necessary APIs (listed under Prerequisites) in your GCP project associated with the API key.

## Running the Server

Start the server using:

```bash
node server.js
```

## Usage Examples (curl)

Here are some examples using curl. Pipe the output to jq for pretty-printed JSON.

1. Geocode an Address:
   ```
   curl -X POST http://localhost:3000/a2a/tasks/send \
     -H "Content-Type: application/json" \
     -d '{
          "taskId": "task-geo-example-1",
          "messages": [
            {
              "role": "user",
              "parts": [
                {
                  "dataPart": {
                    "mimeType": "application/json",
                    "jsonData": {
                      "toolName": "maps_geocode",
                      "arguments": {
                        "address": "1 Place de la Concorde, Paris, France"
                      }
                    }
                  }
                }
              ]
            }
          ]
        }' | jq .
   ```

2. Get Directions:
   ```
    curl -X POST http://localhost:3000/a2a/tasks/send \
     -H "Content-Type: application/json" \
     -d '{
          "taskId": "task-dir-example-2",
          "messages": [
            {
              "role": "user",
              "parts": [
                {
                  "dataPart": {
                    "mimeType": "application/json",
                    "jsonData": {
                      "toolName": "maps_directions",
                      "arguments": {
                        "origin": "Eiffel Tower, Paris",
                        "destination": "Louvre Museum, Paris",
                        "mode": "walking"
                      }
                    }
                  }
                }
              ]
            }
          ]
        }' | jq .
   ```

3. Search for Places:
   ```
   curl -X POST http://localhost:3000/a2a/tasks/send \
     -H "Content-Type: application/json" \
     -d '{
          "taskId": "task-search-example-3",
          "messages": [
            {
              "role": "user",
              "parts": [
                {
                  "dataPart": {
                    "mimeType": "application/json",
                    "jsonData": {
                      "toolName": "maps_search_places",
                      "arguments": {
                        "query": "best pizza near Times Square NYC"
                      }
                    }
                  }
                }
              ]
            }
          ]
        }' | jq .
   ```

4. Get elevation of a location:
   ```
   curl -X POST http://localhost:3000/a2a/tasks/send \
    -H "Content-Type: application/json" \
    -d '{
        "taskId": "task-elevation-everest",
        "messages": [
          {
            "role": "user",
            "parts": [
              {
                "dataPart": {
                  "mimeType": "application/json",
                  "jsonData": {
                    "toolName": "maps_elevation",
                    "arguments": {
                      "locations": [
                        { "latitude": 27.9881, "longitude": 86.9250 }
                      ]
                    }
                  }
                }
              }
            ]
          }
        ]
      }' | jq .
   ```

## License

This project is licensed under the terms of the MIT License.

See the [LICENSE](LICENSE) file for the full license text and permissions.