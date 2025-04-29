import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises'; // To read the agent card
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

const PORT = process.env.PORT || 3000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// --- Helper: Get API Key ---
function getApiKey() {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("FATAL: GOOGLE_MAPS_API_KEY environment variable is not set.");
    process.exit(1);
  }
  return GOOGLE_MAPS_API_KEY;
}

// --- Google Maps API Handlers (Adapted from MCP Example) ---
// These functions now return the core result data or throw an error

async function handleGeocode(address) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("address", address);
  url.searchParams.append("key", getApiKey());

  const response = await fetch(url.toString());
  const data = await response.json(); // Assuming GeocodeResponse structure

  if (data.status !== "OK" || !data.results || data.results.length === 0) {
    throw new Error(`Geocoding failed: ${data.error_message || data.status}`);
  }

  // Return only the relevant data
  return {
    location: data.results[0].geometry.location,
    formatted_address: data.results[0].formatted_address,
    place_id: data.results[0].place_id
  };
}

async function handleReverseGeocode(latitude, longitude) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("latlng", `${latitude},${longitude}`);
  url.searchParams.append("key", getApiKey());

  const response = await fetch(url.toString());
  const data = await response.json(); // Assuming GeocodeResponse structure

  if (data.status !== "OK" || !data.results || data.results.length === 0) {
    throw new Error(`Reverse geocoding failed: ${data.error_message || data.status}`);
  }
  return {
    formatted_address: data.results[0].formatted_address,
    place_id: data.results[0].place_id,
    address_components: data.results[0].address_components
  };
}

async function handlePlaceSearch(query, location, radius) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.append("query", query);
  url.searchParams.append("key", getApiKey());

  if (location) {
    url.searchParams.append("location", `${location.latitude},${location.longitude}`);
  }
  if (radius) {
    url.searchParams.append("radius", radius.toString());
  }

  const response = await fetch(url.toString());
  const data = await response.json(); // Assuming PlacesSearchResponse

  if (data.status !== "OK") {
     throw new Error(`Place search failed: ${data.error_message || data.status}`);
  }
  return {
    places: data.results.map((place) => ({
      name: place.name,
      formatted_address: place.formatted_address,
      location: place.geometry.location,
      place_id: place.place_id,
      rating: place.rating,
      types: place.types
    }))
  };
}

async function handlePlaceDetails(place_id) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.append("place_id", place_id);
  // Specify fields to reduce cost/data, adjust as needed
  url.searchParams.append("fields", "name,place_id,formatted_address,geometry/location,formatted_phone_number,website,rating,reviews,opening_hours");
  url.searchParams.append("key", getApiKey());

  const response = await fetch(url.toString());
  const data = await response.json(); // Assuming PlaceDetailsResponse

  if (data.status !== "OK") {
    throw new Error(`Place details request failed: ${data.error_message || data.status}`);
  }
  return {
    name: data.result.name,
    formatted_address: data.result.formatted_address,
    location: data.result.geometry.location,
    formatted_phone_number: data.result.formatted_phone_number,
    website: data.result.website,
    rating: data.result.rating,
    reviews: data.result.reviews,
    opening_hours: data.result.opening_hours
  };
}

async function handleDistanceMatrix(origins, destinations, mode = "driving") {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.append("origins", origins.join("|"));
  url.searchParams.append("destinations", destinations.join("|"));
  url.searchParams.append("mode", mode);
  url.searchParams.append("key", getApiKey());

  const response = await fetch(url.toString());
  const data = await response.json(); // Assuming DistanceMatrixResponse

  if (data.status !== "OK") {
    throw new Error(`Distance matrix request failed: ${data.error_message || data.status}`);
  }
  return {
    origin_addresses: data.origin_addresses,
    destination_addresses: data.destination_addresses,
    results: data.rows.map((row) => ({
      elements: row.elements.map((element) => ({
        status: element.status,
        duration: element.duration,
        distance: element.distance
      }))
    }))
  };
}

async function handleElevation(locations) {
  const url = new URL("https://maps.googleapis.com/maps/api/elevation/json");
  const locationString = locations
    .map((loc) => `${loc.latitude},${loc.longitude}`)
    .join("|");
  url.searchParams.append("locations", locationString);
  url.searchParams.append("key", getApiKey());

  const response = await fetch(url.toString());
  const data = await response.json(); // Assuming ElevationResponse

  if (data.status !== "OK") {
    throw new Error(`Elevation request failed: ${data.error_message || data.status}`);
  }
  return {
    results: data.results.map((result) => ({
      elevation: result.elevation,
      location: result.location,
      resolution: result.resolution
    }))
  };
}

async function handleDirections(origin, destination, mode = "driving") {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.append("origin", origin);
  url.searchParams.append("destination", destination);
  url.searchParams.append("mode", mode);
  url.searchParams.append("key", getApiKey());

  const response = await fetch(url.toString());
  const data = await response.json(); // Assuming DirectionsResponse

  if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
     throw new Error(`Directions request failed: ${data.error_message || data.status}`);
  }
  // Simplify the response slightly for A2A
  return {
    routes: data.routes.map((route) => ({
      summary: route.summary,
      distance: route.legs[0]?.distance,
      duration: route.legs[0]?.duration,
      steps: route.legs[0]?.steps.map((step) => ({
        instructions: step.html_instructions, // Keep HTML for now, consider stripping tags
        distance: step.distance,
        duration: step.duration,
        travel_mode: step.travel_mode
      }))
    }))
  };
}

// --- NEW: Composite Handler for Elevation by Address ---
async function handleElevationByAddress(address) {
  console.log(`Getting elevation for address: ${address}`);
  // Step 1: Geocode the address
  const geocodeResult = await handleGeocode(address);

  // handleGeocode throws if it fails, so we can assume success if we reach here
  const { location } = geocodeResult; // Extract { lat, lng }

  console.log(`Geocoded ${address} to: ${location.lat}, ${location.lng}`);

  // Step 2: Get elevation for the coordinates
  // handleElevation expects an array of locations
  const elevationResult = await handleElevation([{ latitude: location.lat, longitude: location.lng }]);

  // Return the elevation result (it's already structured correctly by handleElevation)
  // We might want to add the original address or formatted address for context
  return {
      ...elevationResult,
      address: address, // Add original address back
      formatted_address: geocodeResult.formatted_address // Add formatted address from geocode
  };
}

// --- A2A Endpoints ---

// 1. Agent Card Endpoint
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const agentCardPath = path.join(__dirname, 'agent.json');
let agentCardCache = null; // Cache the agent card in memory

app.get('/.well-known/agent.json', async (req, res, next) => {
  try {
    if (!agentCardCache) {
      const cardData = await fs.readFile(agentCardPath, 'utf-8');
      agentCardCache = JSON.parse(cardData);
      // Optionally: Inject the actual base URL if needed, though relative /a2a is often fine
      // agentCardCache.a2a.endpointUrl = `${req.protocol}://${req.get('host')}${agentCardCache.a2a.endpointUrl}`;
    }
    res.json(agentCardCache);
  } catch (error) {
    console.error("Error serving agent card:", error);
    next(error); // Pass to error handler
  }
});

// 2. Task Execution Endpoint (Synchronous)
app.post('/a2a/tasks/send', async (req, res, next) => {
  const taskRequest = req.body;

  // Basic validation
  if (!taskRequest || !taskRequest.taskId || !taskRequest.messages || taskRequest.messages.length === 0) {
    return res.status(400).json({ error: "Invalid A2A task request structure." });
  }

  const initialMessage = taskRequest.messages[0];
  if (initialMessage.role !== 'user' || !initialMessage.parts || initialMessage.parts.length === 0) {
     return res.status(400).json({ error: "Invalid initial user message structure." });
  }

  // --- Extract Tool Call Info ---
  // Expecting the tool call in the first dataPart of the first message
  const dataPart = initialMessage.parts.find(p => p.dataPart)?.dataPart;
  if (!dataPart || !dataPart.jsonData || !dataPart.jsonData.toolName || !dataPart.jsonData.arguments) {
     return res.status(400).json({ error: "Expected toolName and arguments in jsonData of the first dataPart." });
  }

  const { toolName, arguments: toolArgs } = dataPart.jsonData;
  const taskId = taskRequest.taskId;
  let resultData;
  let taskStatus = 'completed'; // Assume success initially
  let errorMessage;

  // --- Execute Tool ---
  try {
    console.log(`Received task ${taskId}: Calling tool ${toolName}`);
    switch (toolName) {
      case "maps_geocode":
        resultData = await handleGeocode(toolArgs.address);
        break;
      case "maps_reverse_geocode":
        resultData = await handleReverseGeocode(toolArgs.latitude, toolArgs.longitude);
        break;
      case "maps_search_places":
        resultData = await handlePlaceSearch(toolArgs.query, toolArgs.location, toolArgs.radius);
        break;
      case "maps_place_details":
        resultData = await handlePlaceDetails(toolArgs.place_id);
        break;
      case "maps_distance_matrix":
        resultData = await handleDistanceMatrix(toolArgs.origins, toolArgs.destinations, toolArgs.mode);
        break;
      case "maps_elevation":
        resultData = await handleElevation(toolArgs.locations);
        break;
      case "maps_get_elevation_by_address":
        resultData = await handleElevationByAddress(toolArgs.address);
        break;
      case "maps_directions":
        resultData = await handleDirections(toolArgs.origin, toolArgs.destination, toolArgs.mode);
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
    console.log(`Task ${taskId} completed successfully for tool ${toolName}`);

  } catch (error) {
    console.error(`Task ${taskId} failed for tool ${toolName}:`, error);
    taskStatus = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  // --- Construct A2A Response ---
  const taskResponse = {
    taskId: taskId,
    status: taskStatus,
    // Include original messages for context (optional but good practice)
    messages: taskRequest.messages,
    artifacts: [], // Add artifact if successful
    error: undefined // Add error details if failed
  };

  if (taskStatus === 'completed' && resultData) {
    taskResponse.artifacts.push({
      // artifactId: uuidv4(), // Consider adding unique artifact IDs if needed
      parts: [{
        dataPart: {
          mimeType: "application/json",
          jsonData: resultData
        }
      }]
    });
  } else if (taskStatus === 'failed') {
     taskResponse.error = {
        // code: "TOOL_EXECUTION_FAILED", // Optional: Add error codes
        message: errorMessage
     };
  }

  res.status(taskStatus === 'completed' ? 200 : 500).json(taskResponse);
});

// --- Basic Error Handler ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message // Avoid sending full stack in production
  });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Google Maps A2A Server listening on port ${PORT}`);
  console.log(`Agent Card available at http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`A2A endpoint: POST http://localhost:${PORT}/a2a/tasks/send`);
  if (!process.env.GOOGLE_MAPS_API_KEY) {
      console.warn("Warning: GOOGLE_MAPS_API_KEY is not set in environment variables.");
  }
});