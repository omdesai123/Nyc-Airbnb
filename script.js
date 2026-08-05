/* =========================================================
   AIRBNB ROOM TYPE PREDICTOR — SCRIPT
   Vanilla JavaScript only.
   ========================================================= */

(() => {
  "use strict";

  /* ---------- CONFIG ---------- */
  const API_URL = "https://nyc-airbnb-7xso.onrender.com";

  // NYC borough -> neighbourhood lookup, built from the categories the
  // trained OneHotEncoder was fit on (see main.py / Model_pipline.pkl).
  const BOROUGH_MAP = {"Manhattan":["Battery Park City","Chelsea","Chinatown","Civic Center","East Harlem","East Village","Financial District","Flatiron District","Gramercy","Greenwich Village","Harlem","Hell's Kitchen","Inwood","Kips Bay","Little Italy","Lower East Side","Marble Hill","Midtown","Morningside Heights","Murray Hill","NoHo","Nolita","Roosevelt Island","SoHo","Stuyvesant Town","Theater District","Tribeca","Two Bridges","Upper East Side","Upper West Side","Washington Heights","West Village"],"Brooklyn":["Bath Beach","Bay Ridge","Bedford-Stuyvesant","Bensonhurst","Bergen Beach","Boerum Hill","Borough Park","Brighton Beach","Brooklyn Heights","Brownsville","Bushwick","Canarsie","Carroll Gardens","Clinton Hill","Cobble Hill","Columbia St","Coney Island","Crown Heights","Cypress Hills","DUMBO","Downtown Brooklyn","Dyker Heights","East Flatbush","East New York","Flatbush","Flatlands","Fort Greene","Fort Hamilton","Gowanus","Gravesend","Greenpoint","Kensington","Manhattan Beach","Midwood","Mill Basin","Navy Yard","Park Slope","Prospect Heights","Prospect-Lefferts Gardens","Red Hook","Sea Gate","Sheepshead Bay","South Slope","Sunset Park","Vinegar Hill","Williamsburg","Windsor Terrace"],"Queens":["Arverne","Astoria","Bay Terrace","Bayside","Bayswater","Belle Harbor","Bellerose","Breezy Point","Briarwood","Cambria Heights","College Point","Corona","Ditmars Steinway","Douglaston","East Elmhurst","Edgemere","Elmhurst","Far Rockaway","Flushing","Forest Hills","Fresh Meadows","Glendale","Hollis","Holliswood","Howard Beach","Jackson Heights","Jamaica","Jamaica Estates","Jamaica Hills","Kew Gardens","Kew Gardens Hills","Laurelton","Little Neck","Long Island City","Maspeth","Middle Village","Neponsit","Ozone Park","Queens Village","Rego Park","Richmond Hill","Ridgewood","Rockaway Beach","Rosedale","South Ozone Park","Springfield Gardens","St. Albans","Sunnyside","Whitestone","Woodhaven","Woodside"],"Bronx":["Allerton","Baychester","Belmont","Bronxdale","Castle Hill","City Island","Claremont Village","Clason Point","Co-op City","Concourse","Concourse Village","East Morrisania","Eastchester","Edenwald","Fieldston","Fordham","Highbridge","Hunts Point","Kingsbridge","Longwood","Melrose","Morris Heights","Morris Park","Morrisania","Mott Haven","Mount Eden","Mount Hope","North Riverdale","Norwood","Olinville","Parkchester","Pelham Bay","Pelham Gardens","Port Morris","Riverdale","Schuylerville","Soundview","Spuyten Duyvil","Throgs Neck","Tremont","Unionport","University Heights","Van Nest","Wakefield","West Farms","Westchester Square","Williamsbridge","Woodlawn"],"Staten Island":["Arden Heights","Arrochar","Bay Terrace, Staten Island","Bull's Head","Castleton Corners","Clifton","Concord","Dongan Hills","Eltingville","Emerson Hill","Graniteville","Grant City","Great Kills","Grymes Hill","Howland Hook","Huguenot","Lighthouse Hill","Mariners Harbor","Midland Beach","New Brighton","New Dorp","New Dorp Beach","New Springville","Oakwood","Port Richmond","Prince's Bay","Randall Manor","Rosebank","Rossville","Shore Acres","Silver Lake","South Beach","St. George","Stapleton","Todt Hill","Tompkinsville","Tottenville","West Brighton","Westerleigh","Willowbrook"]};

  const ROOM_TYPE_LABELS = {
    "Entire home/apt": "Entire Home / Apt",
    "Private room": "Private Room",
    "Shared room": "Shared Room",
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 68; // r=68

  /* ---------- DOM REFS ---------- */
  const form = document.getElementById("predictForm");
  const boroughSelect = document.getElementById("neighbourhood_group");
  const neighbourhoodSelect = document.getElementById("neighbourhood");
  const predictBtn = document.getElementById("predictBtn");
  const clearBtn = document.getElementById("clearBtn");
  const resultEmpty = document.getElementById("resultEmpty");
  const resultContent = document.getElementById("resultContent");
  const predictedType = document.getElementById("predictedType");
  const ringProgress = document.getElementById("ringProgress");
  const ringValue = document.getElementById("ringValue");
  const probaBars = document.getElementById("probaBars");
  const toastContainer = document.getElementById("toastContainer");
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.querySelector(".nav-links");

  /* ---------- INIT: SVG gradient defs for the ring ---------- */
  function injectRingGradient() {
    const svgNS = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(svgNS, "defs");
    defs.innerHTML = `
      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6" />
        <stop offset="55%" stop-color="#a855f7" />
        <stop offset="100%" stop-color="#22d3ee" />
      </linearGradient>`;
    document.querySelector(".confidence-ring").prepend(defs);
    ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
  }

  /* ---------- INIT: populate borough dropdown ---------- */
  function populateBoroughs() {
    Object.keys(BOROUGH_MAP).forEach((borough) => {
      const opt = document.createElement("option");
      opt.value = borough;
      opt.textContent = borough;
      boroughSelect.appendChild(opt);
    });
  }

  function populateNeighbourhoods(borough) {
    neighbourhoodSelect.innerHTML = "";
    if (!borough) {
      neighbourhoodSelect.disabled = true;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = "Select a borough first";
      neighbourhoodSelect.appendChild(placeholder);
      return;
    }
    neighbourhoodSelect.disabled = false;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = "Select a neighbourhood";
    neighbourhoodSelect.appendChild(placeholder);

    BOROUGH_MAP[borough].forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      neighbourhoodSelect.appendChild(opt);
    });
  }

  boroughSelect.addEventListener("change", (e) => {
    populateNeighbourhoods(e.target.value);
    clearFieldError("neighbourhood_group");
  });

  /* ---------- TYPING EFFECT ---------- */
  function typeEffect(el, text, speed = 55) {
    let i = 0;
    el.textContent = "";
    (function tick() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, speed);
      }
    })();
  }

  /* ---------- FLOATING PARTICLES ---------- */
  function createParticles(count = 28) {
    const container = document.getElementById("particles");
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      const size = Math.random() * 3 + 1;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.bottom = `-10px`;
      p.style.animationDuration = `${Math.random() * 12 + 10}s`;
      p.style.animationDelay = `${Math.random() * 10}s`;
      frag.appendChild(p);
    }
    container.appendChild(frag);
  }

  /* ---------- TOASTS ---------- */
  const ICONS = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    warning: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 9v4m0 4h.01M10.3 3.9 2 18a1.5 1.5 0 0 0 1.3 2.2h17.4A1.5 1.5 0 0 0 22 18L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z"/></svg>',
  };

  function showToast(type, title, message, duration = 4200) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${ICONS[type] || ICONS.success}</span>
      <div class="toast-body">
        <h4>${title}</h4>
        <p>${message}</p>
      </div>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("hide");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    }, duration);
  }

  /* ---------- VALIDATION ---------- */
  const FIELD_LABELS = {
    latitude: "Latitude",
    longitude: "Longitude",
    price: "Price per night",
    minimum_nights: "Minimum nights",
    number_of_reviews: "Number of reviews",
    reviews_per_month: "Reviews per month",
    calculated_host_listings_count: "Host listings count",
    availability_365: "Availability",
    neighbourhood_group: "Borough",
    neighbourhood: "Neighbourhood",
  };

  function setFieldError(name, message) {
    const el = form.elements[name];
    const errEl = form.querySelector(`.error-msg[data-for="${name}"]`);
    if (el) el.closest(".field").classList.add("invalid");
    if (errEl) errEl.textContent = message;
  }

  function clearFieldError(name) {
    const el = form.elements[name];
    const errEl = form.querySelector(`.error-msg[data-for="${name}"]`);
    if (el) el.closest(".field").classList.remove("invalid");
    if (errEl) errEl.textContent = "";
  }

  function clearAllErrors() {
    Object.keys(FIELD_LABELS).forEach(clearFieldError);
  }

  function validateForm(data) {
    const errors = [];

    const numericRules = {
      latitude: { min: -90, max: 90 },
      longitude: { min: -180, max: 180 },
      price: { min: 0.01 },
      minimum_nights: { min: 1, max: 365, integer: true },
      number_of_reviews: { min: 0, integer: true },
      reviews_per_month: { min: 0 },
      calculated_host_listings_count: { min: 0, integer: true },
      availability_365: { min: 0, max: 365, integer: true },
    };

    Object.entries(numericRules).forEach(([name, rule]) => {
      const raw = data[name];
      if (raw === "" || raw === null || raw === undefined) {
        errors.push(name);
        setFieldError(name, `${FIELD_LABELS[name]} is required.`);
        return;
      }
      const num = Number(raw);
      if (Number.isNaN(num)) {
        errors.push(name);
        setFieldError(name, `${FIELD_LABELS[name]} must be a number.`);
        return;
      }
      if (rule.integer && !Number.isInteger(num)) {
        errors.push(name);
        setFieldError(name, `${FIELD_LABELS[name]} must be a whole number.`);
        return;
      }
      if (rule.min !== undefined && num < rule.min) {
        errors.push(name);
        setFieldError(name, `${FIELD_LABELS[name]} must be at least ${rule.min}.`);
        return;
      }
      if (rule.max !== undefined && num > rule.max) {
        errors.push(name);
        setFieldError(name, `${FIELD_LABELS[name]} must be at most ${rule.max}.`);
      }
    });

    ["neighbourhood_group", "neighbourhood"].forEach((name) => {
      if (!data[name]) {
        errors.push(name);
        setFieldError(name, `Please select a ${FIELD_LABELS[name].toLowerCase()}.`);
      }
    });

    return errors;
  }

  /* ---------- RESULT RENDERING ---------- */
  function animateRing(fraction) {
    const offset = RING_CIRCUMFERENCE * (1 - fraction);
    // reset then animate for a clean re-trigger
    ringProgress.style.transition = "none";
    ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
    // force reflow
    void ringProgress.getBoundingClientRect();
    ringProgress.style.transition = "";
    requestAnimationFrame(() => {
      ringProgress.style.strokeDashoffset = `${offset}`;
    });
  }

  function animateCounter(el, targetPercent, duration = 1100) {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = `${Math.round(eased * targetPercent)}%`;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Order returned by the /predict endpoint's "Probability" array.
  // This matches the trained classifier's classes_ (alphabetical order).
  const CLASS_ORDER = ["Entire home/apt", "Private room", "Shared room"];

  function renderResult(result) {
    const predicted_room_type = result.predicted_room_type;
    const probabilityList = result.Probability || [];
    const probabilities = {};
    CLASS_ORDER.forEach((cls, i) => {
      probabilities[cls] = probabilityList[i] ?? 0;
    });
    const confidence = probabilities[predicted_room_type] ?? Math.max(...probabilityList, 0);

    const label = ROOM_TYPE_LABELS[predicted_room_type] || predicted_room_type;
    const percent = Math.round(confidence * 100);

    resultEmpty.hidden = true;
    resultContent.hidden = false;

    predictedType.textContent = label;
    animateRing(confidence);
    animateCounter(ringValue, percent);

    // Probability bars, sorted highest first
    probaBars.innerHTML = "";
    const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([cls, prob]) => {
      const pct = Math.round(prob * 100);
      const row = document.createElement("div");
      row.className = "proba-row";
      row.innerHTML = `
        <div class="proba-row-top">
          <span>${ROOM_TYPE_LABELS[cls] || cls}</span>
          <span>${pct}%</span>
        </div>
        <div class="proba-track">
          <div class="proba-fill" style="width:0%"></div>
        </div>`;
      probaBars.appendChild(row);
      requestAnimationFrame(() => {
        row.querySelector(".proba-fill").style.width = `${pct}%`;
      });
    });
  }

  /* ---------- BUTTON RIPPLE ---------- */
  function attachRipple(btn) {
    btn.addEventListener("click", (e) => {
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty("--ripple-x", `${e.clientX - rect.left}px`);
      btn.style.setProperty("--ripple-y", `${e.clientY - rect.top}px`);
      btn.classList.remove("rippling");
      void btn.offsetWidth;
      btn.classList.add("rippling");
    });
  }

  /* ---------- API CALL ---------- */
  async function predict(payload) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail = `Server responded with status ${response.status}.`;
      try {
        const errJson = await response.json();
        if (errJson && errJson.detail) detail = JSON.stringify(errJson.detail);
      } catch (_) {
        /* ignore parse failure */
      }
      throw new Error(detail);
    }

    return response.json();
  }

  /* ---------- FORM SUBMIT ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const errors = validateForm(data);
    if (errors.length > 0) {
      showToast("warning", "Check the form", "Some fields need your attention before predicting.");
      const firstInvalid = form.querySelector(".field.invalid input, .field.invalid select");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const payload = {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      price: Number(data.price),
      minimum_nights: Number(data.minimum_nights),
      number_of_reviews: Number(data.number_of_reviews),
      reviews_per_month: Number(data.reviews_per_month),
      calculated_host_listings_count: Number(data.calculated_host_listings_count),
      availability_365: Number(data.availability_365),
      neighbourhood_group: data.neighbourhood_group,
      neighbourhood: data.neighbourhood,
    };

    predictBtn.classList.add("loading");
    predictBtn.disabled = true;

    try {
      const result = await predict(payload);
      renderResult(result);
      showToast("success", "Prediction ready", `Most likely: ${ROOM_TYPE_LABELS[result.predicted_room_type] || result.predicted_room_type}.`);
    } catch (err) {
      const isNetworkError = err instanceof TypeError;
      showToast(
        "error",
        isNetworkError ? "Server offline" : "Prediction failed",
        isNetworkError
          ? "Couldn't reach the API at 127.0.0.1:8000. Make sure the backend is running."
          : err.message
      );
    } finally {
      predictBtn.classList.remove("loading");
      predictBtn.disabled = false;
    }
  });

  /* ---------- CLEAR FORM ---------- */
  clearBtn.addEventListener("click", () => {
    form.reset();
    clearAllErrors();
    populateNeighbourhoods("");
    resultContent.hidden = true;
    resultEmpty.hidden = false;
    probaBars.innerHTML = "";
    ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
    ringValue.textContent = "0%";
    showToast("success", "Form cleared", "All fields have been reset.");
  });

  /* ---------- MOBILE NAV ---------- */
  navToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });

  /* ---------- SCROLL REVEAL FOR .fade-in / .slide-up outside hero ---------- */
  function initScrollReveal() {
    const targets = document.querySelectorAll(".how-card");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.animationPlayState = "running";
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    targets.forEach((t) => {
      t.style.animationPlayState = "paused";
      observer.observe(t);
    });
  }

  /* ---------- INIT ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    injectRingGradient();
    populateBoroughs();
    createParticles();
    typeEffect(document.getElementById("typedText"), "Airbnb Room Type Prediction");
    attachRipple(predictBtn);
    attachRipple(clearBtn);
    initScrollReveal();
  });
})();
