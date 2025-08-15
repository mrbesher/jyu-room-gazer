function getLanguage() {
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get("lang");
  if (urlLang === "fi" || urlLang === "en") {
    return urlLang;
  }
  return navigator.language.startsWith("fi") ? "fi" : "en";
}

// ============= State Management =============
const AppState = {
  buildings: [],
  spaces: [],
  floors: [],
  filteredSpaces: [],
  buildingIcons: new Map(),
  map: null,
  markers: [],
  selectedMarker: null,
  currentLanguage: getLanguage(),

  setState(updates) {
    Object.assign(this, updates);
    this.notifyListeners();
  },

  listeners: new Set(),

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notifyListeners() {
    this.listeners.forEach((listener) => listener());
  },

  toggleLanguage() {
    // Store current UI state before language change
    const currentState = {
      selectedCampus: document.getElementById("campusSelect").value,
      selectedBuilding: document.getElementById("buildingSelect").value,
      selectedDate: document.getElementById("dateSelect").value,
      selectedTime: document.getElementById("timeSelect").value,
      selectedDuration: document.getElementById("durationSelect").value,
      searchTerm: document.getElementById("searchInput").value,
    };

    this.currentLanguage = this.currentLanguage === "en" ? "fi" : "en";

    // Reprocess buildings and spaces with new language
    const { processedBuildings, processedSpaces } =
      DataProcessor.reprocessWithNewLanguage();

    // Update state with newly processed data
    this.setState({
      buildings: processedBuildings,
      spaces: processedSpaces,
      filteredSpaces: processedSpaces.filter((space) =>
        this.filteredSpaces.some((fs) => fs.spaceLabel === space.spaceLabel),
      ),
    });

    // Update UI with new language
    this.notifyListeners();
    this.updateUILanguage();

    // Update markers
    mapController.updateMarkersForLanguage();

    // Refresh building select and spaces display
    UIController.populateSelects();

    // Restore previous UI state
    if (currentState.selectedCampus) {
      document.getElementById("campusSelect").value =
        currentState.selectedCampus;
      UIController.populateBuildingSelect(currentState.selectedCampus);
    }

    if (currentState.selectedBuilding) {
      document.getElementById("buildingSelect").value =
        currentState.selectedBuilding;
    }

    if (currentState.selectedDuration) {
      document.getElementById("durationSelect").value =
        currentState.selectedDuration;
    }

    if (currentState.selectedDate) {
      document.getElementById("dateSelect").value = currentState.selectedDate;
    }

    if (currentState.selectedTime) {
      document.getElementById("timeSelect").value = currentState.selectedTime;
    }

    if (currentState.searchTerm) {
      document.getElementById("searchInput").value = currentState.searchTerm;
      UIController.handleSearch(currentState.searchTerm);
    }

    // Re-render spaces if any were displayed
    if (this.filteredSpaces.length > 0) {
      UIController.renderSpaces(this.filteredSpaces);
    }
  },

  updateUILanguage() {
    const t = Translations[this.currentLanguage];

    // Update static text elements
    document.querySelector("h1").textContent = t.title;
    document
      .getElementById("campusSelect")
      .querySelector("option").textContent = t.selectCampus;
    document
      .getElementById("buildingSelect")
      .querySelector("option").textContent = t.selectBuilding;
    document.getElementById("checkAvailability").textContent =
      t.checkAvailability;
    document.getElementById("searchInput").placeholder = t.searchSpaces;
    document.getElementById("googleMapsLink").textContent = t.viewOnGoogleMaps;

    // Update legend
    document.querySelectorAll("#colorLegend span").forEach((span, index) => {
      span.textContent = [t.smallCapacity, t.mediumCapacity, t.largeCapacity][
        index
      ];
    });

    UIController.createDurationSelect();
    // Re-render spaces with new language
    if (AppState.filteredSpaces.length > 0) {
      UIController.renderSpaces(AppState.filteredSpaces);
    }
  },
};

let mapController;

const Translations = {
  en: {
    title: "JYU Room Gazer",
    selectCampus: "Select Campus (Optional)",
    selectBuilding: "Select Building",
    checkAvailability: "Check Availability",
    searchSpaces: "Search spaces...",
    loading: "Loading spaces...",
    smallCapacity: "Small capacity (<10)",
    mediumCapacity: "Medium capacity (<30)",
    largeCapacity: "Large capacity (≥30)",
    available: "Available for selected time",
    notAvailable: "Not available for selected time",
    checkAvailabilityText: "Check availability",
    capacity: "Capacity",
    area: "Area",
    reserve: "Reserve",
    viewOnGoogleMaps: "View on Google Maps",
    duration: "Duration",
    minutes: "minutes",
    hour: "hour",
    hours: "hours",
    unnamedSpace: "Unnamed Space",
  },
  fi: {
    title: "JYU Room Gazer",
    selectCampus: "Valitse kampus (Valinnainen)",
    selectBuilding: "Valitse rakennus",
    checkAvailability: "Tarkista saatavuus",
    searchSpaces: "Etsi tiloja...",
    loading: "Ladataan tiloja...",
    smallCapacity: "Pieni kapasiteetti (<10)",
    mediumCapacity: "Keskikokoinen kapasiteetti (<30)",
    largeCapacity: "Suuri kapasiteetti (≥30)",
    available: "Saatavilla valittuna aikana",
    notAvailable: "Ei saatavilla valittuna aikana",
    checkAvailabilityText: "Tarkista saatavuus",
    capacity: "Kapasiteetti",
    area: "Pinta-ala",
    reserve: "Varaa",
    viewOnGoogleMaps: "Näytä Google Mapsissa",
    duration: "Kesto",
    minutes: "minuuttia",
    hour: "tunti",
    hours: "tuntia",
    unnamedSpace: "Nimetön tila",
  },
};

// ============= API Service =============
class APIService {
  static BASE_URL = "https://navi.jyu.fi/api";
  static PROXY_URL = "https://jyu-room-proxy.mrbesher.workers.dev";

  static async fetchWithTimeout(url, options = {}, timeout = 10000) {
    console.log(`🌐 Attempting to fetch: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn(`⚠️ Timeout reached for: ${url}`);
    }, timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`✅ Successful response from: ${url}`);

      if (!response.ok) {
        console.error(`❌ HTTP error! status: ${response.status} for ${url}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📦 Data received from: ${url}`);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`❌ Fetch error for ${url}:`, error);

      // Implement retry logic
      if (error.name === "AbortError") {
        console.log(`🔄 Retrying fetch for: ${url}`);
        return this.fetchWithTimeout(url, options, timeout); // Retry once
      }

      throw error;
    }
  }

  static async fetchAllData() {
    const endpoints = ["buildings", "floors", "spaces", "config"];
    console.log("🚀 Starting to fetch all data");

    try {
      const results = await Promise.all(
        endpoints.map(async (endpoint) => {
          console.log(`📡 Fetching ${endpoint}...`);
          const data = await this.fetchWithTimeout(
            `${this.BASE_URL}/${endpoint}`,
            {},
            15000, // Increased timeout
          );
          console.log(`✅ Successfully fetched ${endpoint}`);
          return data;
        }),
      );

      console.log("✅ All data fetched successfully");
      return {
        buildings: results[0].items,
        floors: results[1].items,
        spaces: results[2].items,
        config: results[3],
      };
    } catch (error) {
      console.error("❌ Failed to fetch all data:", error);
      throw new Error(`Failed to fetch data: ${error.message}`);
    }
  }

  static async checkAvailability(spaces, date, time, duration) {
    try {
      const response = await this.fetchWithTimeout(this.PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaces, date, time, duration }),
      });
      return response;
    } catch (error) {
      throw new Error(`Failed to check availability: ${error.message}`);
    }
  }
}

// ============= Data Processing =============
class DataProcessor {
  static processInitialData(data) {
    const { buildings, floors, spaces, config } = data;

    const locationMap = new Map(config.locations.map((loc) => [loc.id, loc]));
    const categoryMap = new Map(
      (config.spaceCategoryTranslations || []).map((cat) => [cat.id, cat]),
    );

    // Store full location and category data in AppState for later use
    AppState.setState({
      locationTranslations: config.locations,
      categoryTranslations: config.spaceCategoryTranslations || [],
    });

    const buildingIcons = new Map(
      config.locations
        .filter((location) => location.icon?.text)
        .map((location) => [location.id, location.icon.text]),
    );

    // First process spaces to use for building filtering
    const processedSpaces = this.processSpaces(
      spaces,
      categoryMap,
      AppState.currentLanguage,
    );

    // Get building IDs that have valid spaces
    const buildingsWithSpaces = new Set(
      processedSpaces
        .map((space) => floors.find((f) => f.id === space.floorId)?.buildingId)
        .filter(Boolean),
    );

    // Then process buildings using the set of valid building IDs
    const processedBuildings = buildings
      .filter(
        (building) =>
          building && building.id && buildingsWithSpaces.has(building.id),
      )
      .map((building) => {
        const configLocation = locationMap.get(building.id);
        return configLocation
          ? {
              ...building,
              name:
                configLocation.name?.[
                  AppState.currentLanguage === "fi" ? "valueFi" : "valueEn"
                ] ||
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

    return {
      buildings: processedBuildings,
      spaces: processedSpaces,
      floors,
      buildingIcons,
    };
  }

  static processBuildings(buildings, locationMap) {
    return buildings
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
  }

  static processSpaces(spaces, categoryMap, language = "en") {
    const validSpaceCategories = ["31", "214", "33"];
    const validExtensionIds = [4200042, 4100003];

    return spaces
      .map((space) => {
        const categoryTranslation = categoryMap.get(
          space.spaceCategory?.custNumber,
        );
        const extensionTranslation = categoryMap.get(
          space.spaceCategoryExtension?.id?.toString(),
        );

        return {
          ...space,
          spaceCategory: categoryTranslation
            ? {
                ...space.spaceCategory,
                name: categoryTranslation.name[
                  language === "fi" ? "valueFi" : "valueEn"
                ],
              }
            : space.spaceCategory,
          spaceCategoryExtension: extensionTranslation
            ? {
                ...space.spaceCategoryExtension,
                name: extensionTranslation.name[
                  language === "fi" ? "valueFi" : "valueEn"
                ],
              }
            : space.spaceCategoryExtension,
        };
      })
      .filter(
        (space) =>
          space.rentableArea > 0 &&
          space.capacity > 0 &&
          (validSpaceCategories.includes(space.spaceCategory?.custNumber) ||
            validExtensionIds.includes(space.spaceCategoryExtension?.id)),
      );
  }

  static reprocessWithNewLanguage() {
    // Reprocess buildings
    const processedBuildings = AppState.buildings.map((building) => {
      const configLocation = AppState.locationTranslations.find(
        (loc) => loc.id === building.id,
      );
      return configLocation
        ? {
            ...building,
            name:
              configLocation.name?.[
                AppState.currentLanguage === "fi" ? "valueFi" : "valueEn"
              ] ||
              building.name ||
              "Unnamed Building",
          }
        : building;
    });

    // Reprocess spaces
    const processedSpaces = AppState.spaces.map((space) => {
      const categoryTranslation = AppState.categoryTranslations.find(
        (cat) => cat.id === space.spaceCategory?.custNumber,
      );
      const extensionTranslation = AppState.categoryTranslations.find(
        (cat) => cat.id === space.spaceCategoryExtension?.id?.toString(),
      );

      return {
        ...space,
        spaceCategory: categoryTranslation
          ? {
              ...space.spaceCategory,
              name: categoryTranslation.name[
                AppState.currentLanguage === "fi" ? "valueFi" : "valueEn"
              ],
            }
          : space.spaceCategory,
        spaceCategoryExtension: extensionTranslation
          ? {
              ...space.spaceCategoryExtension,
              name: extensionTranslation.name[
                AppState.currentLanguage === "fi" ? "valueFi" : "valueEn"
              ],
            }
          : space.spaceCategoryExtension,
      };
    });

    return { processedBuildings, processedSpaces };
  }
}

// ============= UI Utilities =============
const UIUtils = {
  formatTime(hours, minutes) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  },

  getCapacityColor(capacity) {
    if (capacity === 0) return "text-gray-400";
    if (capacity < 10) return "text-green-500";
    if (capacity < 30) return "text-blue-500";
    return "text-purple-500";
  },

  showLoading() {
    document.getElementById("loadingMessage").classList.remove("hidden");
    document.getElementById("spacesGrid").classList.add("hidden");
  },

  hideLoading() {
    document.getElementById("loadingMessage").classList.add("hidden");
    document.getElementById("spacesGrid").classList.remove("hidden");
  },

  showError(message) {
    const errorDiv = document.getElementById("errorMessage");
    errorDiv.classList.remove("hidden");
    errorDiv.querySelector("div").textContent = message;
  },

  hideError() {
    document.getElementById("errorMessage").classList.add("hidden");
  },

  showWarning(message) {
    const warningDiv = document.createElement("div");
    warningDiv.className = "bg-yellow-50 p-4 rounded-lg text-yellow-700 mb-4";
    warningDiv.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i>${message}`;

    const existingWarning = document.querySelector(".bg-yellow-50");
    if (existingWarning) {
      existingWarning.remove();
    }

    const selectorsDiv = document.querySelector(".grid.md\\:grid-cols-4");
    selectorsDiv.parentNode.insertBefore(warningDiv, selectorsDiv.nextSibling);

    setTimeout(() => warningDiv.remove(), 5000);
  },
};

class MapController {
  constructor(center = [62.2315, 25.7355], zoom = 13) {
    this.defaultCenter = center;
    this.defaultZoom = zoom;
  }

  initialize() {
    if (!AppState.map) {
      AppState.map = L.map("map").setView(this.defaultCenter, this.defaultZoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(AppState.map);
    }
  }

  createMarkerIcon(buildingId, isSelected = false) {
    const iconText = AppState.buildingIcons.get(buildingId) || "•";
    const style = isSelected
      ? {
          bgcolor: "#DC2626",
          size: "28px",
          padding: "5px",
          scale: "1.05",
        }
      : {
          bgcolor: "#3B82F6",
          size: "24px",
          padding: "4px",
          scale: "1",
        };

    return L.divIcon({
      className: "custom-div-icon",
      html: `<div style="
        background-color: ${style.bgcolor};
        min-width: ${style.size};
        min-height: ${style.size};
        width: auto;
        padding: 0 ${style.padding};
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
        transform: scale(${style.scale});
        transition: all 0.2s ease;
        white-space: nowrap;
      ">${iconText}</div>`,
      iconSize: null,
      iconAnchor: [
        style.size === "28px" ? 14 : 12,
        style.size === "28px" ? 14 : 12,
      ],
    });
  }

  updateMarkers() {
    AppState.markers.forEach((marker) => marker.remove());
    AppState.markers = [];

    AppState.buildings.forEach((building) => {
      if (building.latitude && building.longitude) {
        const marker = L.marker([building.latitude, building.longitude], {
          icon: this.createMarkerIcon(building.id),
        })
          .bindPopup(`<b>${building.name}</b><br>${building.campus}`)
          .addTo(AppState.map);

        marker.buildingId = building.id;
        marker.on("click", () => {
          const selectedCampus = document.getElementById("campusSelect").value;
          if (!selectedCampus || building.campus === selectedCampus) {
            document.getElementById("buildingSelect").value = building.id;
            UIController.handleBuildingSelection(building.id);
          }
        });

        AppState.markers.push(marker);
      }
    });
  }

  filterMarkersByCampus(campus) {
    AppState.markers.forEach((marker) => {
      const building = AppState.buildings.find(
        (b) => b.id === marker.buildingId,
      );
      if (!campus || building.campus === campus) {
        marker.addTo(AppState.map);
      } else {
        marker.remove();
      }
    });

    if (campus) {
      const visibleMarkers = AppState.markers.filter((marker) => {
        const building = AppState.buildings.find(
          (b) => b.id === marker.buildingId,
        );
        return building.campus === campus;
      });

      if (visibleMarkers.length > 0) {
        const bounds = L.featureGroup(visibleMarkers).getBounds();
        AppState.map.fitBounds(bounds, { padding: [8, 8] });
      }
    } else {
      AppState.map.setView(this.defaultCenter, this.defaultZoom);
    }
  }

  updateSelectedBuilding(building) {
    if (AppState.selectedMarker) {
      AppState.selectedMarker.setIcon(
        this.createMarkerIcon(AppState.selectedMarker.buildingId),
      );
    }

    const newSelectedMarker = AppState.markers.find(
      (m) => m.buildingId === building.id,
    );
    if (newSelectedMarker) {
      newSelectedMarker.setIcon(this.createMarkerIcon(building.id, true));
      AppState.selectedMarker = newSelectedMarker;
      AppState.map.setView([building.latitude, building.longitude], 16);
    }
  }

  updateMarkersForLanguage() {
    AppState.markers.forEach((marker) => {
      const building = AppState.buildings.find(
        (b) => b.id === marker.buildingId,
      );
      if (building) {
        marker.setPopupContent(`<b>${building.name}</b><br>${building.campus}`);
      }
    });
  }
}

// ============= UI Controller =============
class UIController {
  static initialize() {
    this.initializeDatePicker();
    this.initializeTimeSelect();
    this.createDurationSelect();
    this.setupEventListeners();
  }

  static initializeDatePicker() {
    const dateSelect = document.getElementById("dateSelect");
    const today = new Date();
    const maxDate = new Date();
    maxDate.setDate(today.getDate() + 5);

    dateSelect.min = today.toISOString().split("T")[0];
    dateSelect.max = maxDate.toISOString().split("T")[0];
    dateSelect.value = today.toISOString().split("T")[0];
  }

  static initializeTimeSelect() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = Math.ceil(now.getMinutes() / 30) * 30;

    if (minutes >= 60) {
      hours += 1;
      minutes = 0;
    }

    // Handle day wraparound
    if (hours >= 24) {
      hours = 0;
    }

    document.getElementById("timeSelect").value = UIUtils.formatTime(
      hours,
      minutes,
    );
  }

  static createDurationSelect() {
    const t = Translations[AppState.currentLanguage];
    const select = document.createElement("select");
    select.id = "durationSelect";
    select.className = "w-full p-2 border rounded-lg bg-white shadow-sm";

    const options = [
      `<option value="30">30 ${t.minutes}</option>`,
      ...Array.from({ length: 12 }, (_, i) => {
        const hour = i + 1;
        return [
          `<option value="${hour * 60}">${hour} ${hour > 1 ? t.hours : t.hour}</option>`,
          hour < 12
            ? `<option value="${hour * 60 + 30}">${hour}:30 ${t.hours}</option>`
            : "",
        ];
      }).flat(),
    ];

    select.innerHTML = options.join("");
    select.value = "60";

    const current = document.getElementById("durationSelect");
    current.parentNode.replaceChild(select, current);
  }

  static setupEventListeners() {
    document
      .getElementById("campusSelect")
      .addEventListener("change", (e) =>
        this.handleCampusSelection(e.target.value),
      );

    document
      .getElementById("buildingSelect")
      .addEventListener("change", (e) =>
        this.handleBuildingSelection(e.target.value),
      );

    document
      .getElementById("searchInput")
      .addEventListener("input", (e) => this.handleSearch(e.target.value));

    document
      .getElementById("checkAvailability")
      .addEventListener("click", () => this.handleAvailabilityCheck());

    document.getElementById("languageToggle").addEventListener("click", () => {
      AppState.toggleLanguage();
    });
  }

  static populateSelects() {
    this.populateCampusSelect();
    this.populateBuildingSelect("");
  }

  static populateCampusSelect() {
    const t = Translations[AppState.currentLanguage];
    const campusSelect = document.getElementById("campusSelect");
    const campuses = [...new Set(AppState.buildings.map((b) => b.campus))];

    campusSelect.innerHTML =
      `<option value="">${t.selectCampus}</option>` +
      campuses
        .map((campus) => `<option value="${campus}">${campus}</option>`)
        .join("");
  }

  static populateBuildingSelect(campus) {
    const t = Translations[AppState.currentLanguage];
    const buildingSelect = document.getElementById("buildingSelect");
    const filteredBuildings = campus
      ? AppState.buildings.filter((b) => b.campus === campus)
      : AppState.buildings;

    buildingSelect.innerHTML =
      `<option value="">${t.selectBuilding}</option>` +
      filteredBuildings
        .map(
          (building) =>
            `<option value="${building.id}">${building.name}${
              campus ? "" : ` (${building.campus})`
            }</option>`,
        )
        .join("");

    buildingSelect.disabled = false;
  }

  static async handleCampusSelection(campus) {
    this.populateBuildingSelect(campus);
    mapController.filterMarkersByCampus(campus);

    if (campus) {
      try {
        UIUtils.showLoading();
        UIUtils.hideError();

        const campusBuildings = AppState.buildings.filter(
          (b) => b.campus === campus,
        );
        const buildingFloors = AppState.floors.filter((floor) =>
          campusBuildings.some((b) => b.id === floor.buildingId),
        );

        AppState.setState({
          filteredSpaces: AppState.spaces.filter((space) =>
            buildingFloors.some((floor) => floor.id === space.floorId),
          ),
        });

        this.renderSpaces(AppState.filteredSpaces);
        document.getElementById("searchContainer").classList.remove("hidden");
        document.getElementById("checkAvailability").disabled = false;
      } catch (error) {
        console.error("Error processing campus selection:", error);
        UIUtils.showError("Failed to load campus details");
      } finally {
        UIUtils.hideLoading();
      }
    } else {
      AppState.setState({ filteredSpaces: [] });
      document.getElementById("spacesGrid").innerHTML = "";
      document.getElementById("searchContainer").classList.add("hidden");
      document.getElementById("checkAvailability").disabled = true;
    }
  }

  static async handleBuildingSelection(buildingId) {
    if (!buildingId) {
      // Revert to campus filtering
      const selectedCampus = document.getElementById("campusSelect").value;
      if (selectedCampus) {
        this.handleCampusSelection(selectedCampus);
      }
      return;
    }

    try {
      UIUtils.showLoading();
      UIUtils.hideError();

      const building = AppState.buildings.find((b) => b.id === buildingId);
      mapController.updateSelectedBuilding(building);

      const buildingFloors = AppState.floors.filter(
        (floor) => floor.buildingId === buildingId,
      );

      AppState.setState({
        filteredSpaces: AppState.spaces.filter((space) =>
          buildingFloors.some((floor) => floor.id === space.floorId),
        ),
      });

      this.renderSpaces(AppState.filteredSpaces);

      document.getElementById("searchContainer").classList.remove("hidden");
      document.getElementById("checkAvailability").disabled = false;
      document.getElementById("googleMapsLink").href =
        `https://www.google.com/maps?q=${building.latitude},${building.longitude}`;
      document.getElementById("googleMapsLink").classList.remove("hidden");
    } catch (error) {
      console.error("Error processing building selection:", error);
      UIUtils.showError("Failed to load building details");
    } finally {
      UIUtils.hideLoading();
    }
  }

  static handleSearch(searchTerm) {
    const searchResults = AppState.filteredSpaces.filter(
      (space) =>
        space.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        space.spaceLabel?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        space.spaceCategory?.name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()),
    );
    this.renderSpaces(searchResults);
  }

  static async handleAvailabilityCheck() {
    const date = document.getElementById("dateSelect").value;
    const time = document.getElementById("timeSelect").value;
    const duration = document.getElementById("durationSelect").value;

    if (!date || !time || !duration) {
      UIUtils.showError("Please select date, time, and duration");
      return;
    }

    this.validateAndAdjustTime(timeSelect);

    try {
      UIUtils.showLoading();

      // Split spaces into batches of 30
      for (let i = 0; i < AppState.filteredSpaces.length; i += 30) {
        const spaceBatch = AppState.filteredSpaces.slice(i, i + 30);
        const response = await APIService.checkAvailability(
          spaceBatch,
          date,
          time,
          duration,
        );

        response.availabilityResults.forEach((result) => {
          const space = AppState.filteredSpaces.find(
            (s) => s.spaceLabel === result.spaceLabel,
          );
          if (space) {
            space.isAvailable = result.isAvailable;
          }
        });

        // Immediately recheck null results for this batch
        const nullSpaces = spaceBatch.filter((s) => s.isAvailable === null);
        if (nullSpaces.length > 0) {
          const recheckResponse = await APIService.checkAvailability(
            nullSpaces,
            date,
            time,
            duration,
          );
          recheckResponse.availabilityResults.forEach((result) => {
            const space = AppState.filteredSpaces.find(
              (s) => s.spaceLabel === result.spaceLabel,
            );
            if (space) {
              space.isAvailable = result.isAvailable;
            }
          });
        }

        // Update UI after each batch
        this.renderSpaces(AppState.filteredSpaces);
      }
    } catch (error) {
      console.error("Error checking availability:", error);
      UIUtils.showError("Failed to check availability");
    } finally {
      UIUtils.hideLoading();
    }
  }

  static validateAndAdjustTime(timeInput) {
    const [hours, minutes] = timeInput.value.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    const roundedMinutes = Math.floor(totalMinutes / 30) * 30;

    if (totalMinutes !== roundedMinutes) {
      const newHours = Math.floor(roundedMinutes / 60);
      const newMinutes = roundedMinutes % 60;
      const adjustedTime = UIUtils.formatTime(newHours, newMinutes);
      timeInput.value = adjustedTime;
      UIUtils.showWarning(
        `Time adjusted to ${adjustedTime} to match available booking slots`,
      );
    }
  }

  static renderSpaces(spaces) {
    const t = Translations[AppState.currentLanguage];
    const sortedSpaces = [...spaces].sort((a, b) => {
      if (a.isAvailable === b.isAvailable) {
        return (a.spaceLabel || "").localeCompare(b.spaceLabel || "");
      }
      return a.isAvailable ? -1 : 1;
    });

    const grid = document.getElementById("spacesGrid");
    grid.innerHTML = sortedSpaces
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
                ${space.spaceLabel || t.unnamedSpace}
                ${space.name ? `(${space.name})` : ""}
              </h3>
              <div class="flex items-center gap-2">
                <i class="fas fa-users ${UIUtils.getCapacityColor(space.capacity)}"></i>
                <a href="https://kovs-calendar.app.jyu.fi/room/${encodeURIComponent(
                  space.spaceLabel,
                )}?date=${document.getElementById("dateSelect").value}&lang=${
                  AppState.currentLanguage
                }"
                  target="_blank"
                  class="text-xs text-gray-500 hover:text-blue-600 hover:underline">
                  <i class="fas fa-external-link-alt"></i>
                  ${t.reserve}
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
                  ? t.available
                  : space.isAvailable === false
                    ? t.notAvailable
                    : t.checkAvailabilityText
              }</span>
            </div>
            ${
              space.spaceCategory?.name || space.spaceCategoryExtension?.name
                ? `
                <div class="flex items-center text-sm text-gray-600">
                  <i class="fas fa-building mr-2"></i>
                  <span>${space.spaceCategory?.name || ""}${
                    space.spaceCategory?.name &&
                    space.spaceCategoryExtension?.name
                      ? " / "
                      : ""
                  }${space.spaceCategoryExtension?.name || ""}</span>
                </div>
                `
                : ""
            }
            ${
              space.capacity > 0
                ? `
                <div class="flex items-center text-sm text-gray-600">
                  <i class="fas fa-users mr-2"></i>
                  <span>${t.capacity}: ${space.capacity}</span>
                </div>
                `
                : ""
            }
            ${
              space.rentableArea > 0
                ? `
                <div class="flex items-center text-sm text-gray-600">
                  <i class="fas fa-ruler-combined mr-2"></i>
                  <span>${t.area}: ${Math.round(space.rentableArea)}m²</span>
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
}

// ============= Main Application Initialization =============
class App {
  static async initialize() {
    console.log("🚀 Starting application initialization");

    try {
      UIUtils.showLoading();
      console.log("⚙️ Initializing UI Controller");
      UIController.initialize();

      console.log("🗺️ Initializing Map Controller");
      mapController = new MapController();
      mapController.initialize();

      console.log("📡 Fetching initial data");
      const data = await APIService.fetchAllData();

      console.log("🔄 Processing data");
      const processedData = DataProcessor.processInitialData(data);

      console.log("📦 Updating application state");
      AppState.setState({
        buildings: processedData.buildings,
        spaces: processedData.spaces,
        floors: processedData.floors,
        buildingIcons: processedData.buildingIcons,
      });

      AppState.updateUILanguage();

      console.log("📍 Updating map markers");
      mapController.updateMarkers();

      console.log("📝 Populating select menus");
      UIController.populateSelects();

      console.log("✅ Initialization complete");
      UIUtils.hideLoading();
    } catch (error) {
      console.error("❌ Initialization failed:", error);
      UIUtils.showError(`Failed to initialize application: ${error.message}`);

      // Attempt recovery
      console.log("🔄 Attempting to recover...");
      setTimeout(() => {
        console.log("🔄 Retrying initialization");
        App.initialize();
      }, 5000); // Retry after 5 seconds
    }
  }
}

// Start the application when DOM is ready
document.addEventListener("DOMContentLoaded", () => App.initialize());
