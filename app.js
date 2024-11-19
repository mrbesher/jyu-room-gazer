// State management
let buildings = [];
let allSpaces = [];
let allFloors = [];
let filteredSpaces = [];
let map;
let currentMarkers = [];
let selectedMarker = null;
let buildingIcons = new Map();

// Initialize date constraints
function initializeDatePicker() {
  const dateSelect = document.getElementById("dateSelect");
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 5);

  dateSelect.min = today.toISOString().split("T")[0];
  dateSelect.max = maxDate.toISOString().split("T")[0];
  dateSelect.value = today.toISOString().split("T")[0];
}

function initializeTimeSelect() {
  const timeSelect = document.getElementById("timeSelect");
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();

  // Round to nearest 30 minutes
  minutes = Math.ceil(minutes / 30) * 30;

  // Adjust hours if minutes roll over to next hour
  if (minutes >= 60) {
    hours += 1;
    minutes = 0;
  }

  // Format time as HH:MM
  const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  timeSelect.value = timeString;
}

function createDurationSelect() {
  const durationSelect = document.getElementById("durationSelect");
  const currentSelect = document.createElement("select");
  currentSelect.id = "durationSelect";
  currentSelect.className = "w-full p-2 border rounded-lg bg-white shadow-sm";

  // Create options from 30 minutes to 12 hours
  const options = [];

  // Add 30 minutes option
  options.push(`<option value="30">30 minutes</option>`);

  // Add 1-12 hours options with 30-minute intervals
  for (let hour = 1; hour <= 12; hour++) {
    options.push(
      `<option value="${hour * 60}">${hour} hour${hour > 1 ? "s" : ""}</option>`,
    );
    if (hour < 12) {
      // Don't add 30 minutes to the last hour
      options.push(
        `<option value="${hour * 60 + 30}">${hour}:30 hours</option>`,
      );
    }
  }

  currentSelect.innerHTML = options.join("");

  // Set default value to 60 minutes (1 hour)
  currentSelect.value = "60";

  // Replace the existing input with the new select
  durationSelect.parentNode.replaceChild(currentSelect, durationSelect);
}

// Helper functions
function showLoading() {
  document.getElementById("loadingMessage").classList.remove("hidden");
  document.getElementById("spacesGrid").classList.add("hidden");
}

function hideLoading() {
  document.getElementById("loadingMessage").classList.add("hidden");
  document.getElementById("spacesGrid").classList.remove("hidden");
}

function showError(message) {
  const errorDiv = document.getElementById("errorMessage");
  errorDiv.classList.remove("hidden");
  errorDiv.querySelector("div").textContent = message;
}

function showWarning(message) {
  const warningDiv = document.createElement("div");
  warningDiv.className = "bg-yellow-50 p-4 rounded-lg text-yellow-700 mb-4";
  warningDiv.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i>${message}`;

  // Remove existing warning if any
  const existingWarning = document.querySelector(".bg-yellow-50");
  if (existingWarning) {
    existingWarning.remove();
  }

  // Insert warning after the selectors
  const selectorsDiv = document.querySelector(".grid.md\\:grid-cols-4");
  selectorsDiv.parentNode.insertBefore(warningDiv, selectorsDiv.nextSibling);

  // Auto-remove warning after 5 seconds
  setTimeout(() => {
    warningDiv.remove();
  }, 5000);
}

function hideError() {
  document.getElementById("errorMessage").classList.add("hidden");
}

function getCapacityColor(capacity) {
  if (capacity === 0) return "text-gray-400";
  if (capacity < 10) return "text-green-500";
  if (capacity < 30) return "text-blue-500";
  return "text-purple-500";
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function createDefaultIcon(buildingId) {
  const iconText = buildingIcons.get(buildingId) || "•";
  return L.divIcon({
    className: "custom-div-icon",
    html: `<div style="
      background-color: #3B82F6;
      min-width: 24px;
      min-height: 24px;
      width: auto;
      padding: 0 4px;
      border-radius: 999px;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 10px;
      font-family: system-ui, -apple-system, sans-serif;
      transition: all 0.2s ease;
      white-space: nowrap;
      ">${iconText}</div>`,
    iconSize: null, // Remove fixed size constraint
    iconAnchor: [12, 12],
  });
}

function createSelectedIcon(buildingId) {
  const iconText = buildingIcons.get(buildingId) || "•";
  return L.divIcon({
    className: "custom-div-icon",
    html: `<div style="
      background-color: #DC2626;
      min-width: 28px;
      min-height: 28px;
      width: auto;
      padding: 0 5px;
      border-radius: 999px;
      border: 2px solid white;
      box-shadow: 0 3px 6px rgba(0,0,0,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 10px;
      font-family: system-ui, -apple-system, sans-serif;
      transition: all 0.2s ease;
      transform: scale(1.05);
      white-space: nowrap;
      ">${iconText}</div>`,
    iconSize: null, // Remove fixed size constraint
    iconAnchor: [14, 14],
  });
}

function filterMarkersByCampus(campus) {
  currentMarkers.forEach((marker) => {
    const building = buildings.find((b) => b.id === marker.buildingId);
    if (!campus || building.campus === campus) {
      marker.addTo(map);
    } else {
      marker.remove();
    }
  });

  // If a campus is selected, fit the map bounds to show all visible markers
  if (campus) {
    const visibleMarkers = currentMarkers.filter((marker) => {
      const building = buildings.find((b) => b.id === marker.buildingId);
      return building.campus === campus;
    });

    if (visibleMarkers.length > 0) {
      const bounds = L.featureGroup(visibleMarkers).getBounds();
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  } else {
    // If no campus is selected, show all of Jyväskylä
    map.setView([62.2315, 25.7355], 13);
  }
}

function updateMap(latitude, longitude, name, address, buildingId) {
  const mapContainer = document.getElementById("mapContainer");
  mapContainer.classList.remove("hidden");

  if (!map) {
    // Initialize the map if not already done
    map = L.map("map").setView([latitude, longitude], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  } else {
    // Update the map view
    map.setView([latitude, longitude], 15);
  }

  // Update Google Maps link
  const googleMapsLink = document.getElementById("googleMapsLink");
  googleMapsLink.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
  googleMapsLink.classList.remove("hidden");

  // Update marker highlighting
  if (selectedMarker) {
    selectedMarker.setIcon(createDefaultIcon(selectedMarker.buildingId));
  }

  const newSelectedMarker = currentMarkers.find(
    (m) => m.buildingId === buildingId,
  );
  if (newSelectedMarker) {
    newSelectedMarker.setIcon(createSelectedIcon(buildingId));
    selectedMarker = newSelectedMarker;
  }
}

// Parse the HTML response to get availability data
function parseAvailabilityData(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Get all reservation slots
  const slots = Array.from(doc.querySelectorAll(".reservations .slot"));

  return slots.map((slot) => ({
    type: slot.classList.contains("free")
      ? "free"
      : slot.classList.contains("reserved")
        ? "reserved"
        : "restricted",
    minutesFromStart: parseInt(slot.dataset.minfromdaystart),
    duration: parseInt(slot.dataset.min),
  }));
}

async function checkAllSpacesAvailability() {
  const date = document.getElementById("dateSelect").value;
  const time = document.getElementById("timeSelect").value;
  const duration = document.getElementById("durationSelect").value;

  if (!date || !time || !duration) {
    showError("Please select date, time, and duration");
    return;
  }

  showLoading();

  try {
    const response = await fetch(
      "https://jyu-room-proxy.mrbesher.workers.dev",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spaces: filteredSpaces,
          date,
          time,
          duration,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    data.availabilityResults.forEach((result) => {
      const space = filteredSpaces.find(
        (s) => s.spaceLabel === result.spaceLabel,
      );
      if (space) {
        space.isAvailable = result.isAvailable;
      }
    });

    renderSpaces(filteredSpaces);
  } catch (error) {
    console.error("Error checking all spaces:", error);
    showError("Failed to check availability");
  } finally {
    hideLoading();
  }
}

function getBuildingsWithSpaces() {
  // Get all building IDs that have valid spaces
  const buildingIdsWithSpaces = new Set();

  allSpaces.forEach((space) => {
    const floor = allFloors.find((f) => f.id === space.floorId);
    if (floor) {
      buildingIdsWithSpaces.add(floor.buildingId);
    }
  });

  // Filter buildings array to only include buildings with spaces
  return buildings.filter((building) => buildingIdsWithSpaces.has(building.id));
}

async function fetchBuildings(retryCount = 3, timeout = 5000) {
  try {
    showLoading();
    hideError();

    const fetchWithTimeout = async (url, attempts = retryCount) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (attempts > 1 && error.name === "AbortError") {
          console.log(
            `Retrying fetch for ${url}, ${attempts - 1} attempts left`,
          );
          return fetchWithTimeout(url, attempts - 1);
        }
        throw error;
      }
    };

    // 1. Fetch all data
    const endpoints = [
      "https://navi.jyu.fi/api/buildings",
      "https://navi.jyu.fi/api/floors",
      "https://navi.jyu.fi/api/spaces",
      "https://navi.jyu.fi/api/config",
    ];

    const [buildingsResponse, floorsResponse, spacesResponse, configResponse] =
      await Promise.all(endpoints.map((url) => fetchWithTimeout(url)));

    // 2. Parse JSON responses
    const [buildingsData, floorsData, spacesData, configData] =
      await Promise.all([
        buildingsResponse.json(),
        floorsResponse.json(),
        spacesResponse.json(),
        configResponse.json(),
      ]);

    // 3. Validate data structure
    if (
      !buildingsData?.items ||
      !floorsData?.items ||
      !spacesData?.items ||
      !configData?.locations
    ) {
      throw new Error("Invalid data structure received from API");
    }

    // 4. Create utility maps
    const locationMap = new Map(
      configData.locations.map((loc) => [loc.id, loc]),
    );
    const categoryMap = new Map(
      (configData.spaceCategoryTranslations || []).map((cat) => [cat.id, cat]),
    );
    buildingIcons = new Map(
      configData.locations
        .filter((location) => location.icon?.text)
        .map((location) => [location.id, location.icon.text]),
    );

    // 5. Process buildings
    buildings = buildingsData.items
      .filter((building) => building && building.id)
      .map((building) => {
        const configLocation = locationMap.get(building.id);
        return configLocation
          ? {
              ...building,
              name:
                configLocation.name?.valueEn ||
                building.name ||
                "Unnamed Building",
              latitude:
                configLocation.coordinates?.latitude || building.latitude,
              longitude:
                configLocation.coordinates?.longitude || building.longitude,
            }
          : building;
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // 6. Process floors and spaces
    allFloors = floorsData.items;

    const validSpaceCategories = ["31", "214", "33"];
    const validExtensionIds = [4200042, 4100003];

    allSpaces = spacesData.items
      .map((space) => {
        const category = categoryMap.get(space.spaceCategory?.custNumber);
        return category
          ? {
              ...space,
              spaceCategory: {
                ...space.spaceCategory,
                name: category.name.valueEn,
              },
            }
          : space;
      })
      .filter(
        (space) =>
          space.rentableArea > 0 &&
          space.capacity > 0 &&
          (validSpaceCategories.includes(space.spaceCategory?.custNumber) ||
            validExtensionIds.includes(space.spaceCategoryExtension?.id)),
      );

    // 7. Initialize and update map
    if (!map) {
      map = L.map("map").setView([62.2315, 25.7355], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
    }

    buildings = getBuildingsWithSpaces();

    // Clear existing markers
    currentMarkers.forEach((marker) => marker.remove());
    currentMarkers = [];
    selectedMarker = null;

    // Add new markers
    buildings.forEach((building) => {
      if (building.latitude && building.longitude) {
        const marker = L.marker([building.latitude, building.longitude], {
          icon: createDefaultIcon(building.id),
        })
          .bindPopup(`<b>${building.name}</b><br>${building.campus}`)
          .addTo(map);

        marker.buildingId = building.id;

        marker.on("click", () => {
          const selectedCampus = document.getElementById("campusSelect").value;
          if (!selectedCampus || building.campus === selectedCampus) {
            document.getElementById("buildingSelect").value = building.id;
            fetchBuildingData(building.id);
          }
        });

        currentMarkers.push(marker);
      }
    });

    // 8. Update UI
    document.getElementById("mapContainer").classList.remove("hidden");
    setTimeout(() => map.invalidateSize(), 100);
    document.getElementById("googleMapsLink").classList.add("hidden");

    populateCampusSelect();
    populateBuildingSelect("");
    hideLoading();
  } catch (error) {
    console.error("Error fetching data:", error);
    showError(`Failed to load buildings: ${error.message}`);
    hideLoading();
  }
}

async function fetchBuildingData(buildingId) {
  try {
    showLoading();
    hideError();

    const building = buildings.find((b) => b.id === buildingId);
    const { name, campus, latitude, longitude, address } = building;

    // Update map with selected building
    updateMap(latitude, longitude, name, address, buildingId);

    // Filter floors and spaces for the selected building
    const buildingFloors = allFloors.filter(
      (floor) => floor.buildingId === buildingId,
    );
    filteredSpaces = allSpaces.filter((space) =>
      buildingFloors.some((floor) => floor.id === space.floorId),
    );

    renderSpaces(filteredSpaces);
    hideLoading();
    document.getElementById("searchContainer").classList.remove("hidden");
    document.getElementById("checkAvailability").disabled = false;
  } catch (error) {
    console.error("Error processing building data:", error);
    showError("Failed to load building details");
    hideLoading();
  }
}

function validateDuration() {
  const durationInput = document.getElementById("durationSelect");
  const duration = parseInt(durationInput.value);

  // Most rooms have a maximum booking time of 3 hours
  if (duration > 12 * 60 || duration < 30) {
    durationInput.setCustomValidity(
      "Duration must be between 30 minutes and 12 hours.",
    );
    durationInput.reportValidity();
    return false;
  } else {
    durationInput.setCustomValidity("");
    return true;
  }
}

function validateAndAdjustTime(timeInput) {
  const [hours, minutes] = timeInput.value.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  const roundedMinutes = Math.floor(totalMinutes / 30) * 30;

  if (totalMinutes !== roundedMinutes) {
    const newHours = Math.floor(roundedMinutes / 60);
    const newMinutes = roundedMinutes % 60;
    const adjustedTime = `${newHours.toString().padStart(2, "0")}:${newMinutes.toString().padStart(2, "0")}`;
    timeInput.value = adjustedTime;

    // Show warning message
    showWarning(
      `Time adjusted to ${adjustedTime} to match available booking slots`,
    );
  }
}

// UI population
function populateCampusSelect() {
  const campusSelect = document.getElementById("campusSelect");
  const campuses = [...new Set(buildings.map((b) => b.campus))];

  campusSelect.innerHTML =
    '<option value="">Select Campus (Optional)</option>' +
    campuses
      .map((campus) => `<option value="${campus}">${campus}</option>`)
      .join("");
}

function populateBuildingSelect(campus) {
  const buildingSelect = document.getElementById("buildingSelect");
  // If campus is empty, show all buildings, otherwise filter by campus
  const filteredBuildings = campus
    ? buildings.filter((b) => b.campus === campus)
    : buildings;

  buildingSelect.innerHTML =
    '<option value="">Select Building</option>' +
    filteredBuildings
      .map(
        (building) =>
          `<option value="${building.id}">${building.name}${campus ? "" : ` (${building.campus})`}</option>`,
      )
      .join("");

  buildingSelect.disabled = false;
}

function setSpaceLoading(spaceLabel, isLoading) {
  const spaceCard = document.querySelector(
    `[data-space-label="${spaceLabel}"]`,
  );
  if (spaceCard) {
    if (isLoading) {
      spaceCard.classList.add("loading");
    } else {
      spaceCard.classList.remove("loading");
    }
  }
}

function renderSpaces(spacesToRender) {
  // Sort by availability first, then by spaceLabel
  spacesToRender.sort((a, b) => {
    if (a.isAvailable === b.isAvailable) {
      return (a.spaceLabel || "").localeCompare(b.spaceLabel || "");
    }
    return a.isAvailable ? -1 : 1;
  });

  const grid = document.getElementById("spacesGrid");
  grid.innerHTML = spacesToRender
    .map(
      (space) => `
           <div class="card bg-white rounded-lg overflow-hidden border ${
             space.isAvailable === true
               ? "border-green-200"
               : space.isAvailable === false
                 ? "border-red-200"
                 : "border-gray-200"
           }">
               <div class="bg-gray-50 border-b p-4 ${
                 space.isAvailable === true
                   ? "bg-green-50"
                   : space.isAvailable === false
                     ? "bg-red-50"
                     : ""
               }">
                   <div class="flex items-center justify-between">
                      <h3 class="font-semibold overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                          ${space.spaceLabel || "Unnamed Space"}
                          ${space.name ? `(${space.name})` : ""}
                      </h3>
                       <div class="flex items-center gap-2">
                           <i class="fas fa-users ${getCapacityColor(space.capacity)}"></i>
                           <a href="https://kovs-calendar.app.jyu.fi/room/${encodeURIComponent(space.spaceLabel)}?date=${document.getElementById("dateSelect").value}&lang=en"
                              target="_blank"
                              class="text-xs text-gray-500 hover:text-blue-600 hover:underline">
                              <i class="fas fa-external-link-alt"></i>
                              Reserve
                           </a>
                       </div>
                   </div>
               </div>
               <div class="p-4 space-y-2">
                   <div class="flex items-center text-sm ${
                     space.isAvailable === true
                       ? "status-available"
                       : space.isAvailable === false
                         ? "status-unavailable"
                         : "status-unknown"
                   } p-2 rounded">
                       <i class="fas ${
                         space.isAvailable === true
                           ? "fa-check"
                           : space.isAvailable === false
                             ? "fa-times"
                             : "fa-question"
                       } mr-2"></i>
                       <span>${
                         space.isAvailable === true
                           ? "Available for selected time"
                           : space.isAvailable === false
                             ? "Not available for selected time"
                             : "Check availability"
                       }</span>
                   </div>
                   ${
                     space.spaceCategory?.name ||
                     space.spaceCategoryExtension?.name
                       ? `
                       <div class="flex items-center text-sm text-gray-600">
                           <i class="fas fa-building mr-2"></i>
                           <span>${space.spaceCategory?.name || ""}${space.spaceCategory?.name && space.spaceCategoryExtension?.name ? " / " : ""}${space.spaceCategoryExtension?.name || ""}</span>
                       </div>
                   `
                       : ""
                   }
                  ${
                    space.capacity > 0
                      ? `
                      <div class="flex items-center text-sm text-gray-600">
                          <i class="fas fa-users mr-2"></i>
                          <span>Capacity: ${space.capacity}</span>
                      </div>
                  `
                      : ""
                  }
                  ${
                    space.rentableArea > 0
                      ? `
                      <div class="flex items-center text-sm text-gray-600">
                          <i class="fas fa-ruler-combined mr-2"></i>
                          <span>Area: ${Math.round(space.rentableArea)}m²</span>
                      </div>
                  `
                      : ""
                  }
              </div>
          </div>
      `,
    )
    .join("");
}

// Event Listeners
document.getElementById("campusSelect").addEventListener("change", (e) => {
  const campus = e.target.value;
  populateBuildingSelect(campus);
  filterMarkersByCampus(campus);
});

document.getElementById("buildingSelect").addEventListener("change", (e) => {
  const buildingId = e.target.value;
  if (buildingId) {
    fetchBuildingData(buildingId);
  }
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const searchResults = filteredSpaces.filter(
    (space) =>
      space.name?.toLowerCase().includes(searchTerm) ||
      false ||
      space.spaceLabel?.toLowerCase().includes(searchTerm) ||
      false ||
      space.spaceCategory?.name?.toLowerCase().includes(searchTerm) ||
      false,
  );
  renderSpaces(searchResults);
});

document
  .getElementById("durationSelect")
  .addEventListener("change", validateDuration);

document.getElementById("checkAvailability").addEventListener("click", (e) => {
  const timeInput = document.getElementById("timeSelect");
  validateAndAdjustTime(timeInput);
  checkAllSpacesAvailability();
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initializeDatePicker();
  initializeTimeSelect();
  createDurationSelect();
  fetchBuildings();
});
