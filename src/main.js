import "./style.css";
import * as THREE from "three";
import GUI from "lil-gui";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <section class="hero-copy glass-panel">
    <p class="subtitle">
      Kéo để xoay góc nhìn, dùng con lăn để zoom. Click để mở chi tiết quốc gia, và cho phép location để xem quốc gia hiện tại của bạn.
    </p>
  </section>
  <aside class="country-info glass-panel" aria-live="polite">
    <p class="country-label">Current Location</p>
    <h2 id="country-name">Đang xin quyền vị trí...</h2>
    <p id="country-population">Quốc gia: -</p>
    <p id="country-daylight" class="status neutral">Trạng thái: -</p>
    <p id="country-updated" class="updated-at">Vị trí: -</p>
    <button id="focus-current-btn" class="focus-current-btn" type="button" disabled>
      Focus vị trí hiện tại
    </button>
  </aside>
  <section class="country-detail glass-panel" id="country-detail" aria-hidden="true">
    <button class="detail-close" id="detail-close" type="button" aria-label="Đóng chi tiết quốc gia">X</button>
    <p class="country-label">Country Detail</p>
    <h3 id="detail-country-name">-</h3>
    <div class="detail-map-wrap">
      <svg id="country-map" class="country-map" viewBox="0 0 800 520" role="img" aria-label="Country map detail"></svg>
    </div>
    <p id="detail-country-population">Dân số: -</p>
    <p id="detail-country-daylight" class="status neutral">Trạng thái: -</p>
    <p id="detail-country-updated" class="updated-at">UTC: -</p>
  </section>
  <section class="map-overlay" id="map-overlay" aria-hidden="true">
    <div class="map-canvas" id="leaflet-map" aria-label="Leaflet Map"></div>
  </section>
  <canvas class="webgl" aria-label="Interactive 3D Earth"></canvas>
`;

const canvas = document.querySelector(".webgl");
const countryNameEl = document.querySelector("#country-name");
const countryPopulationEl = document.querySelector("#country-population");
const countryDaylightEl = document.querySelector("#country-daylight");
const countryUpdatedEl = document.querySelector("#country-updated");
const focusCurrentBtnEl = document.querySelector("#focus-current-btn");
const countryDetailEl = document.querySelector("#country-detail");
const detailCloseEl = document.querySelector("#detail-close");
const detailCountryNameEl = document.querySelector("#detail-country-name");
const detailCountryPopulationEl = document.querySelector(
  "#detail-country-population",
);
const detailCountryDaylightEl = document.querySelector(
  "#detail-country-daylight",
);
const detailCountryUpdatedEl = document.querySelector(
  "#detail-country-updated",
);
const countryMapEl = document.querySelector("#country-map");
const mapOverlayEl = document.querySelector("#map-overlay");
const mapCanvasEl = document.querySelector("#leaflet-map");

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x050b18, 18, 50);

const camera = new THREE.PerspectiveCamera(
  52,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 1.2, 5.5);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.minDistance = 2.02;
controls.maxDistance = 10;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.8;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

const ambientLight = new THREE.AmbientLight(0xb7c7ff, 0.42);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
sunLight.position.set(6, 2, 5);
scene.add(sunLight);

const nightRimLight = new THREE.DirectionalLight(0x4ea6ff, 0.7);
nightRimLight.position.set(-4, -1, -4);
scene.add(nightRimLight);

const textureLoader = new THREE.TextureLoader();
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

function loadTexture(path, { color = false } = {}) {
  const texture = textureLoader.load(path);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

const earthDayMap = loadTexture("/textures/earth_day.jpg", { color: true });
const earthNightMap = loadTexture("/textures/earth_night.png", { color: true });
const earthSpecularMap = loadTexture("/textures/earth_specular.jpg");
const earthCloudMap = loadTexture("/textures/earth_clouds.png");

const sunDirection = new THREE.Vector3(1, 0, 0);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragState = {
  active: false,
  moved: false,
  startX: 0,
  startY: 0,
};
const CLICK_MOVE_THRESHOLD = 7;
let countries = [];
let selectedCountry = null;
const currentLocation = {
  status: "requesting",
  latitude: null,
  longitude: null,
  country: null,
  error: null,
};
const focusAnimation = {
  active: false,
  startTime: 0,
  duration: 900,
  fromPosition: new THREE.Vector3(),
  toPosition: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
};
const mapState = {
  active: false,
  loading: false,
  map: null,
  tileLayer: null,
  bindingsReady: false,
  center: { lat: 0, lon: 0 },
  prewarmed: false,
};

const earthGeometry = new THREE.SphereGeometry(1.8, 160, 160);
const earthMaterial = new THREE.ShaderMaterial({
  uniforms: {
    dayMap: { value: earthDayMap },
    nightMap: { value: earthNightMap },
    specularMap: { value: earthSpecularMap },
    sunDirection: { value: sunDirection },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPositionW;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vPositionW = worldPos.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform sampler2D specularMap;
    uniform vec3 sunDirection;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPositionW;

    void main() {
      vec3 normalW = normalize(vNormalW);
      vec3 sunDir = normalize(sunDirection);
      vec3 viewDir = normalize(cameraPosition - vPositionW);
      vec3 halfVec = normalize(sunDir + viewDir);

      float ndl = max(dot(normalW, sunDir), 0.0);
      float twilight = smoothstep(-0.15, 0.20, dot(normalW, sunDir));
      float fresnel = pow(1.0 - max(dot(normalW, viewDir), 0.0), 2.2);

      vec3 dayColor = texture2D(dayMap, vUv).rgb;
      vec3 nightColor = texture2D(nightMap, vUv).rgb * 0.85;
      float specMask = texture2D(specularMap, vUv).r;
      float specular = pow(max(dot(normalW, halfVec), 0.0), 72.0) * specMask;

      vec3 litDay = dayColor * (0.34 + ndl * 1.35);
      vec3 color = mix(nightColor, litDay, twilight);
      color += vec3(specular * 0.9);
      color += dayColor * (twilight * 0.08);
      color += vec3(0.035, 0.09, 0.18) * fresnel;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});
const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

const atmosphereGeometry = new THREE.SphereGeometry(1.92, 128, 128);
const atmosphereMaterial = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  uniforms: {
    glowColor: { value: new THREE.Color("#66b3ff") },
  },
  vertexShader: `
    varying vec3 vNormalW;
    void main() {
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 glowColor;
    varying vec3 vNormalW;
    void main() {
      float intensity = pow(0.72 - dot(vNormalW, vec3(0.0, 0.0, 1.0)), 2.4);
      gl_FragColor = vec4(glowColor, intensity);
    }
  `,
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

const cloudGeometry = new THREE.SphereGeometry(1.84, 128, 128);
const cloudMaterial = new THREE.MeshPhongMaterial({
  map: earthCloudMap,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});
const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
scene.add(clouds);

const starsCount = 1300;
const starsGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(starsCount * 3);

for (let i = 0; i < starsCount; i += 1) {
  const i3 = i * 3;
  const radius = 18 + Math.random() * 24;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);

  positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
  positions[i3 + 1] = radius * Math.cos(phi);
  positions[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}

starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const starsMaterial = new THREE.PointsMaterial({
  color: "#c6d9ff",
  size: 0.045,
  sizeAttenuation: true,
});

const stars = new THREE.Points(starsGeometry, starsMaterial);
scene.add(stars);

const params = {
  autoRotate: true,
  rotateSpeed: 0.35,
  atmosphere: true,
  cloudOpacity: 0.35,
};

const gui = new GUI({ title: "Scene Controls" });
gui
  .add(params, "autoRotate")
  .name("Auto Orbit")
  .onChange((value) => {
    controls.autoRotate = value;
  });
gui
  .add(params, "rotateSpeed", 0, 2, 0.01)
  .name("Orbit Speed")
  .onChange((value) => {
    controls.autoRotateSpeed = value;
  });
gui
  .add(params, "atmosphere")
  .name("Atmosphere")
  .onChange((visible) => {
    atmosphere.visible = visible;
  });
gui
  .add(params, "cloudOpacity", 0, 0.9, 0.01)
  .name("Cloud Opacity")
  .onChange((value) => {
    cloudMaterial.opacity = value;
  });

function getDayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.floor((now - start) / 86400000);
}

function normalizeLongitude(lon) {
  let result = lon;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return result;
}

function getSubsolarPoint(now = new Date()) {
  const minutesUTC =
    now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  const dayOfYear = getDayOfYear(now);
  const gamma =
    ((2 * Math.PI) / 365) * (dayOfYear - 1 + (minutesUTC / 60 - 12) / 24);

  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const longitude = normalizeLongitude((720 - minutesUTC - equationOfTime) / 4);
  const latitude = THREE.MathUtils.radToDeg(declination);

  return { latitude, longitude };
}

function latLonToVector3(lat, lon, radius = 1) {
  const latRad = THREE.MathUtils.degToRad(lat);
  const lonRad = THREE.MathUtils.degToRad(lon);
  const cosLat = Math.cos(latRad);

  return new THREE.Vector3(
    radius * cosLat * Math.cos(lonRad),
    radius * Math.sin(latRad),
    -radius * cosLat * Math.sin(lonRad),
  );
}

function ringContainsPoint(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonContainsPoint(lon, lat, rings) {
  if (!rings.length || !ringContainsPoint(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (ringContainsPoint(lon, lat, rings[i])) return false;
  }
  return true;
}

function computeBBox(geometry) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  return { minLon, maxLon, minLat, maxLat };
}

function computeCountryCenter(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let lonSum = 0;
  let latSum = 0;
  let count = 0;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        lonSum += lon;
        latSum += lat;
        count += 1;
      }
    }
  }

  return {
    lon: count > 0 ? lonSum / count : 0,
    lat: count > 0 ? latSum / count : 0,
  };
}

function pointInCountry(country, lon, lat) {
  if (
    lon < country.bbox.minLon ||
    lon > country.bbox.maxLon ||
    lat < country.bbox.minLat ||
    lat > country.bbox.maxLat
  ) {
    return false;
  }

  const { geometry } = country;
  if (geometry.type === "Polygon") {
    return polygonContainsPoint(lon, lat, geometry.coordinates);
  }

  for (const polygon of geometry.coordinates) {
    if (polygonContainsPoint(lon, lat, polygon)) return true;
  }

  return false;
}

function formatPopulation(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("vi-VN").format(Math.round(value));
}

function formatTimezoneOffset(offsetMinutes) {
  const total = -offsetMinutes;
  const sign = total >= 0 ? "+" : "-";
  const abs = Math.abs(total);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

function formatLocalDateTime(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const selectedMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.03, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffd166 }),
);
selectedMarker.visible = false;
scene.add(selectedMarker);

function setSelectedCountry(country) {
  selectedCountry = country;
  if (!country) {
    selectedMarker.visible = false;
    return;
  }

  selectedMarker.position.copy(
    latLonToVector3(country.center.lat, country.center.lon, 1.86),
  );
  selectedMarker.visible = true;
}

function findCountryByLatLon(lat, lon) {
  for (const country of countries) {
    if (pointInCountry(country, lon, lat)) return country;
  }
  return null;
}

function refreshCurrentLocationCountry() {
  if (
    !countries.length ||
    currentLocation.latitude === null ||
    currentLocation.longitude === null
  ) {
    return;
  }
  currentLocation.country = findCountryByLatLon(
    currentLocation.latitude,
    currentLocation.longitude,
  );
}

function getLatLonFromPointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const intersection = raycaster.intersectObject(earth, false)[0];
  if (!intersection) return null;

  const localPoint = earth.worldToLocal(intersection.point.clone()).normalize();
  return {
    lon: THREE.MathUtils.radToDeg(Math.atan2(-localPoint.z, localPoint.x)),
    lat: THREE.MathUtils.radToDeg(Math.asin(localPoint.y)),
  };
}

function getLatLonFromCameraCenter() {
  const origin = camera.position.clone();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction).normalize();
  const radius = 1.8;

  const b = 2 * origin.dot(direction);
  const c = origin.dot(origin) - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / 2;
  if (!Number.isFinite(t) || t <= 0) return null;
  const hit = origin.add(direction.multiplyScalar(t)).normalize();

  return {
    lon: THREE.MathUtils.radToDeg(Math.atan2(-hit.z, hit.x)),
    lat: THREE.MathUtils.radToDeg(Math.asin(hit.y)),
  };
}

function computeLeafletZoom(distance) {
  const minDistance = controls.minDistance;
  const maxDistance = controls.maxDistance;
  const t = THREE.MathUtils.clamp(
    (distance - minDistance) / (maxDistance - minDistance),
    0,
    1,
  );
  return Math.round(THREE.MathUtils.lerp(6, 2, t));
}

function setMapOpen(open) {
  mapOverlayEl.setAttribute("aria-hidden", String(!open));
  mapOverlayEl.classList.toggle("is-visible", open);
  app.classList.toggle("map-open", open);
}

function initLeafletMap() {
  if (mapState.map || mapState.loading) return;
  mapState.loading = true;
  mapState.map = L.map(mapCanvasEl, {
    zoomControl: false,
    attributionControl: true,
    inertia: true,
    zoomSnap: 1,
    wheelPxPerZoomLevel: 90,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 6,
  });
  mapState.tileLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  );
  mapState.tileLayer.addTo(mapState.map);
  mapState.map.setView([0, 0], 0, { animate: false });
  mapState.loading = false;
}

function openMapAtCurrentView() {
  if (mapState.active || mapState.loading) return;
  initLeafletMap();
  if (!mapState.map) return;
  params.autoRotate = false;
  controls.autoRotate = false;
  controls.enabled = false;
  closeCountryDetail();

  const focusPoint = getLatLonFromCameraCenter() || { lat: 0, lon: 0 };
  const distance = camera.position.distanceTo(controls.target);
  const zoom = computeLeafletZoom(distance);
  mapState.center = focusPoint;
  mapState.map.setView([focusPoint.lat, focusPoint.lon], zoom, {
    animate: false,
  });

  setMapOpen(true);
  requestAnimationFrame(() => {
    mapState.map.invalidateSize();
  });
  mapState.active = true;

  if (!mapState.bindingsReady) {
    mapState.map.on("moveend", () => {
      const center = mapState.map.getCenter();
      mapState.center = { lat: center.lat, lon: center.lng };
    });
    mapState.map.on("zoomend", () => {
      if (!mapState.active) return;
      if (mapState.map.getZoom() <= 5) {
        closeMapOverlay();
      }
    });
    mapState.bindingsReady = true;
  }
}

function closeMapOverlay() {
  if (!mapState.active) return;
  mapState.active = false;
  setMapOpen(false);
  controls.enabled = true;
  if (mapState.center) {
    focusLatLon(mapState.center.lat, mapState.center.lon, {
      closeDetail: true,
    });
  }
}

function updateCurrentLocationPanel(now = new Date()) {
  if (currentLocation.status === "requesting") {
    countryNameEl.textContent = "Đang xin quyền vị trí...";
    countryPopulationEl.textContent = "Quốc gia: -";
    countryDaylightEl.textContent = "Trạng thái: Chờ cấp quyền";
    countryDaylightEl.className = "status neutral";
    countryUpdatedEl.textContent = "Vị trí: -";
    focusCurrentBtnEl.disabled = true;
    return;
  }

  if (
    currentLocation.status === "unsupported" ||
    currentLocation.status === "denied" ||
    currentLocation.status === "error"
  ) {
    countryNameEl.textContent =
      currentLocation.status === "unsupported"
        ? "Trình duyệt không hỗ trợ Location"
        : "Không lấy được vị trí hiện tại";
    countryPopulationEl.textContent = `Chi tiết: ${currentLocation.error || "-"}`;
    countryDaylightEl.textContent = "Trạng thái: -";
    countryDaylightEl.className = "status neutral";
    countryUpdatedEl.textContent = "Vị trí: -";
    focusCurrentBtnEl.disabled = true;
    return;
  }

  const { latitude, longitude } = currentLocation;
  const localDirection = latLonToVector3(latitude, longitude, 1).normalize();
  const isDay = localDirection.dot(sunDirection) > 0;
  const country = currentLocation.country;
  const localTime = formatLocalDateTime(now);
  const tzOffset = formatTimezoneOffset(now.getTimezoneOffset());

  countryNameEl.textContent = country
    ? country.name
    : "Không xác định quốc gia";
  countryPopulationEl.textContent = `Dân số: ${country ? formatPopulation(country.population) : "-"}`;
  countryDaylightEl.textContent = `Trạng thái: ${isDay ? "Ban ngày" : "Ban đêm"}`;
  countryDaylightEl.className = `status ${isDay ? "day" : "night"}`;
  countryUpdatedEl.textContent = `Vị trí: ${latitude.toFixed(3)}, ${longitude.toFixed(3)} | Local: ${localTime} (${tzOffset})`;
  focusCurrentBtnEl.disabled = false;
}

function handleLocationSuccess(position) {
  currentLocation.status = "ready";
  currentLocation.latitude = position.coords.latitude;
  currentLocation.longitude = position.coords.longitude;
  currentLocation.error = null;
  refreshCurrentLocationCountry();
  updateCurrentLocationPanel();
}

function handleLocationError(error) {
  currentLocation.status = error.code === 1 ? "denied" : "error";
  currentLocation.error = error.message || "Không thể truy cập vị trí";
  updateCurrentLocationPanel();
}

function requestCurrentLocation() {
  if (!("geolocation" in navigator)) {
    currentLocation.status = "unsupported";
    currentLocation.error = "Geolocation API không khả dụng";
    updateCurrentLocationPanel();
    return;
  }

  currentLocation.status = "requesting";
  updateCurrentLocationPanel();
  const options = {
    enableHighAccuracy: false,
    timeout: 12000,
    maximumAge: 120000,
  };

  navigator.geolocation.getCurrentPosition(
    handleLocationSuccess,
    handleLocationError,
    options,
  );
}

function startFocusTransition(targetPosition, targetLookAt) {
  focusAnimation.active = true;
  focusAnimation.startTime = performance.now();
  focusAnimation.fromPosition.copy(camera.position);
  focusAnimation.toPosition.copy(targetPosition);
  focusAnimation.fromTarget.copy(controls.target);
  focusAnimation.toTarget.copy(targetLookAt);
  controls.enabled = false;
}

function focusLatLon(lat, lon, { closeDetail = true } = {}) {
  const direction = latLonToVector3(lat, lon, 1).normalize();
  const distance = THREE.MathUtils.clamp(
    camera.position.distanceTo(controls.target),
    3.2,
    4.6,
  );
  const targetPosition = direction.multiplyScalar(distance);
  const targetLookAt = new THREE.Vector3(0, 0, 0);
  params.autoRotate = false;
  if (closeDetail) closeCountryDetail();
  startFocusTransition(targetPosition, targetLookAt);
}

function focusCurrentLocation(options = {}) {
  if (currentLocation.latitude === null || currentLocation.longitude === null) {
    return;
  }
  focusLatLon(currentLocation.latitude, currentLocation.longitude, options);
}

function focusCountry(country, options = {}) {
  if (!country) return;
  focusLatLon(country.center.lat, country.center.lon, options);
}

function focusAndOpenCurrentCountry() {
  if (!currentLocation.country) return;
  setSelectedCountry(currentLocation.country);
  openCountryDetail(currentLocation.country);
  focusCountry(currentLocation.country, { closeDetail: false });
}

function setDetailOpen(open) {
  app.classList.toggle("detail-open", open);
  countryDetailEl.setAttribute("aria-hidden", String(!open));
}

function buildCountryMapSvg(country) {
  const viewWidth = 820;
  const viewHeight = 520;
  const padding = 26;
  const innerWidth = viewWidth - padding * 2;
  const innerHeight = viewHeight - padding * 2;
  const lonSpan = Math.max(1e-6, country.bbox.maxLon - country.bbox.minLon);
  const latSpan = Math.max(1e-6, country.bbox.maxLat - country.bbox.minLat);
  const scale = Math.min(innerWidth / lonSpan, innerHeight / latSpan);
  const contentWidth = lonSpan * scale;
  const contentHeight = latSpan * scale;
  const offsetX = (viewWidth - contentWidth) * 0.5;
  const offsetY = (viewHeight - contentHeight) * 0.5;

  function projectPoint(lon, lat) {
    return {
      x: offsetX + (lon - country.bbox.minLon) * scale,
      y: offsetY + (country.bbox.maxLat - lat) * scale,
    };
  }

  const polygons =
    country.geometry.type === "Polygon"
      ? [country.geometry.coordinates]
      : country.geometry.coordinates;

  const pathData = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!ring.length) continue;
      const start = projectPoint(ring[0][0], ring[0][1]);
      pathData.push(`M${start.x.toFixed(2)},${start.y.toFixed(2)}`);
      for (let i = 1; i < ring.length; i += 1) {
        const point = projectPoint(ring[i][0], ring[i][1]);
        pathData.push(`L${point.x.toFixed(2)},${point.y.toFixed(2)}`);
      }
      pathData.push("Z");
    }
  }

  countryMapEl.setAttribute("viewBox", `0 0 ${viewWidth} ${viewHeight}`);
  countryMapEl.innerHTML = `
    <defs>
      <linearGradient id="map-fill" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7de0ff" />
        <stop offset="55%" stop-color="#5db8ff" />
        <stop offset="100%" stop-color="#4b79ff" />
      </linearGradient>
      <filter id="map-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <pattern id="map-grid" width="36" height="36" patternUnits="userSpaceOnUse">
        <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(159,181,216,0.24)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect x="0" y="0" width="${viewWidth}" height="${viewHeight}" fill="url(#map-grid)" />
    <path d="${pathData.join(" ")}" fill="url(#map-fill)" fill-opacity="0.84" stroke="#ddf2ff" stroke-width="2.2" filter="url(#map-glow)" />
  `;
}

function updateCountryDetail(country, now = new Date()) {
  if (!country) return;
  const localDirection = latLonToVector3(
    country.center.lat,
    country.center.lon,
    1,
  ).normalize();
  const isDay = localDirection.dot(sunDirection) > 0;

  detailCountryNameEl.textContent = country.name;
  detailCountryPopulationEl.textContent = `Dân số: ${formatPopulation(country.population)}`;
  detailCountryDaylightEl.textContent = `Trạng thái: ${isDay ? "Ban ngày" : "Ban đêm"}`;
  detailCountryDaylightEl.className = `status ${isDay ? "day" : "night"}`;
  const localTime = formatLocalDateTime(now);
  const tzOffset = formatTimezoneOffset(now.getTimezoneOffset());
  detailCountryUpdatedEl.textContent = `Local: ${localTime} (${tzOffset}) | UTC: ${now.toISOString().replace("T", " ").slice(0, 19)}`;
}

function openCountryDetail(country, now = new Date()) {
  updateCountryDetail(country, now);
  buildCountryMapSvg(country);
  setDetailOpen(true);
}

function closeCountryDetail() {
  setDetailOpen(false);
}

async function loadCountries() {
  const response = await fetch("/data/countries.geojson");
  const geojson = await response.json();
  countries = geojson.features
    .filter(
      (feature) =>
        feature.geometry?.type === "Polygon" ||
        feature.geometry?.type === "MultiPolygon",
    )
    .map((feature) => {
      const name =
        feature.properties.NAME_LONG || feature.properties.NAME || "Unknown";
      return {
        name,
        population: Number(feature.properties.POP_EST),
        geometry: feature.geometry,
        bbox: computeBBox(feature.geometry),
        center: computeCountryCenter(feature.geometry),
      };
    });
  refreshCurrentLocationCountry();
}

function pickCountryByPointer(clientX, clientY) {
  const hit = getLatLonFromPointer(clientX, clientY);
  if (!hit) return null;
  const { lon, lat } = hit;

  for (const country of countries) {
    if (pointInCountry(country, lon, lat)) return country;
  }

  return null;
}

canvas.addEventListener("pointerdown", (event) => {
  dragState.active = true;
  dragState.moved = false;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragState.active || dragState.moved) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  if (dx * dx + dy * dy > CLICK_MOVE_THRESHOLD * CLICK_MOVE_THRESHOLD) {
    dragState.moved = true;
  }
});

canvas.addEventListener("pointerup", (event) => {
  if (!dragState.active) return;
  dragState.active = false;
  if (dragState.moved) return;

  if (app.classList.contains("detail-open")) {
    closeCountryDetail();
    return;
  }

  const country = pickCountryByPointer(event.clientX, event.clientY);
  setSelectedCountry(country);
  if (selectedCountry) {
    openCountryDetail(selectedCountry);
    focusCountry(selectedCountry, { closeDetail: false });
    return;
  }
  closeCountryDetail();
});

canvas.addEventListener("pointercancel", () => {
  dragState.active = false;
  dragState.moved = false;
});

detailCloseEl.addEventListener("click", () => {
  closeCountryDetail();
});

focusCurrentBtnEl.addEventListener("click", () => {
  focusAndOpenCurrentCountry();
});

app.addEventListener("pointerup", (event) => {
  if (!app.classList.contains("detail-open")) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (countryDetailEl.contains(target)) return;
  if (target.closest(".webgl")) return;
  closeCountryDetail();
});

function tick() {
  const elapsed = clock.getElapsedTime();
  const now = new Date();
  const subsolar = getSubsolarPoint(now);
  sunDirection.copy(
    latLonToVector3(subsolar.latitude, subsolar.longitude, 1).normalize(),
  );
  sunLight.position.copy(sunDirection).multiplyScalar(8);
  nightRimLight.position.copy(sunDirection).multiplyScalar(-5);

  clouds.rotation.y += 0.00022;
  controls.autoRotate = params.autoRotate;
  controls.autoRotateSpeed = params.rotateSpeed;
  stars.rotation.y = elapsed * 0.01;
  updateCurrentLocationPanel(now);

  if (focusAnimation.active) {
    const progress = Math.min(
      (performance.now() - focusAnimation.startTime) / focusAnimation.duration,
      1,
    );
    const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(
      focusAnimation.fromPosition,
      focusAnimation.toPosition,
      eased,
    );
    controls.target.lerpVectors(
      focusAnimation.fromTarget,
      focusAnimation.toTarget,
      eased,
    );
    camera.lookAt(controls.target);
    if (progress >= 1) {
      focusAnimation.active = false;
      controls.enabled = true;
    }
  }

  if (selectedCountry) {
    if (app.classList.contains("detail-open")) {
      updateCountryDetail(selectedCountry, now);
    }
  }

  controls.update();
  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
}

loadCountries()
  .catch(() => {
    currentLocation.status = "error";
    currentLocation.error = "Không tải được dữ liệu quốc gia";
    updateCurrentLocationPanel();
  })
  .finally(() => {
    setSelectedCountry(null);
    setDetailOpen(false);
    requestCurrentLocation();
    tick();
    const idle =
      window.requestIdleCallback ||
      ((callback) => window.setTimeout(callback, 800));
    idle(() => {
      initLeafletMap();
      if (mapState.map && !mapState.prewarmed) {
        const focusPoint = getLatLonFromCameraCenter() || { lat: 0, lon: 0 };
        const distance = camera.position.distanceTo(controls.target);
        const zoom = computeLeafletZoom(distance);
        mapState.map.setView([focusPoint.lat, focusPoint.lon], zoom, {
          animate: false,
        });
        mapState.map.invalidateSize();
        mapState.prewarmed = true;
      }
    });
  });

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
});

controls.addEventListener("change", () => {
  if (mapState.active || mapState.loading) return;
  const distance = camera.position.distanceTo(controls.target);
  if (distance <= controls.minDistance + 0.02) {
    openMapAtCurrentView();
  }
});
