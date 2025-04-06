// dashboard.js

// We'll store the raw CSV rows here so we can re-filter without parsing again
let rawData = [];

let earliestDateObj = null;
let latestDateObj = null;
let totalDays = 0;

// Parse CSV and initialize everything
Papa.parse('data/data.csv', {
	download: true,
	header: true,
	complete: function(results) {
		rawData = results.data;

		// Filter out any empty rows
		rawData = rawData.filter(row => {
			const dateObj = new Date(parseDateDDMMYYYY(row.device_created_day));
			return row.region && row.product && row.device_created_day && dateObj > new Date('2021-10-01');
		});

		// Convert "device_created_day" to date objects and find min/max dates
		rawData.forEach(row => {
			const dateStr = parseDateDDMMYYYY(row.device_created_day);
			if (!dateStr) return;
			const dateObj = new Date(dateStr);

			if (!earliestDateObj || dateObj < earliestDateObj) earliestDateObj = dateObj;
			if (!latestDateObj || dateObj > latestDateObj) latestDateObj = dateObj;
		});

		if (!earliestDateObj || !latestDateObj) {
			console.error('No valid dates found in data.');
			return;
		}

		totalDays = dayDifference(new Date(earliestDateObj), new Date(latestDateObj));

		rawData.forEach(row => {
			const dateStr = parseDateDDMMYYYY(row.device_created_day);
			if (dateStr) {
				row.offsetDays = dayDifference(new Date(earliestDateObj), new Date(dateStr));
			} else {
				row.offsetDays = null;
			}
		});

		// Populate dropdown with unique "region" values
		populateRegionDropdown(rawData);

		// Initialize date slider
		initDateSlider();

		// Render initial charts with "no filter" (regionSelect.value = "")
		renderAllCharts();

		// Set up event listener for the reset button
		const resetButton = document.getElementById('resetFilters');
		resetButton.addEventListener('click', () => {
			console.log('Reset button clicked');
			const regionSelect = document.getElementById('regionSelect');
			regionSelect.value = '';

			$("#dateSlider").slider("values", [0, totalDays]);
			updateDateRangeLabel(0, totalDays);
			toggleFilterMap.checked = false;

			renderAllCharts();
		});
	}
});

// -------------
const regionView = {
	'Wien':           { center: { lat: 48.210033, lon: 16.363449 }, zoom: 8 },
	'Niederösterreich': { center: { lat: 48.2186,  lon: 15.8040 },  zoom: 5.9 },
	'Oberösterreich':   { center: { lat: 48.1000,  lon: 13.9720 },  zoom: 6 },
	'Salzburg':         { center: { lat: 47.5095,  lon: 13.0550 },  zoom: 6 },
	'Steiermark':       { center: { lat: 47.2593,  lon: 15.0890 },  zoom: 6 },
	'Kärnten':          { center: { lat: 46.836,   lon: 13.8122 },  zoom: 6 },
	'Tirol':            { center: { lat: 47.2682,  lon: 11.4041 },  zoom: 6 },
	'Vorarlberg':       { center: { lat: 47.2478,  lon: 9.9016 },   zoom: 6.5 },
	'Burgenland':       { center: { lat: 47.5167,  lon: 16.3667 },  zoom: 6 }
};

// ---------------
const citicenPerRegion = {
	'Wien': 2000000,
	'Niederösterreich': 1730000,
	'Oberösterreich': 1530000,
	'Salzburg': 570000,
	'Steiermark': 1200000,
	'Kärnten': 580000,
	'Tirol': 780000,
	'Vorarlberg': 410000,
	'Burgenland': 300000
};

// --------------
// The jQuery UI range slider
function initDateSlider() {
	// Start with full range [0, totalDays]
	$("#dateSlider").slider({
		range: true,
		min: 0,
		max: totalDays,
		values: [0, totalDays], // left handle=0, right handle=totalDays
		slide: function(event, ui) {
			// called on every handle move
			updateDateRangeLabel(ui.values[0], ui.values[1]);
			renderAllCharts(); // re-filter on slide
		}
	});

	// Show initial label
	updateDateRangeLabel(0, totalDays);

	toggleFilterMap.addEventListener('change', () => {
		renderAllCharts();
	});
}

// This updates the #dateRangeLabel text
function updateDateRangeLabel(offsetStart, offsetEnd) {
	const startDate = addDays(earliestDateObj, offsetStart);
	const endDate = addDays(earliestDateObj, offsetEnd);

	const startStr = startDate.toISOString().split('T')[0].slice(0, 7);
	const endStr = endDate.toISOString().split('T')[0].slice(0, 7);

	// $("#dateRangeLabel").text(`Range: ${startStr} - ${endStr}`);
	/*
			<div class="flex-filter">
			<div id="dateRangeLabelStart" style="margin-bottom: 20px;">Start Date:</div>
			<div id="dateSlider" style="width:300px; margin: 20px 0;"></div>
			<!-- <div id="dateRangeLabel" style="margin-bottom: 20px;">Range: ? - ?</div> -->
			<div id="dateRangeLabelEnd" style="margin-bottom: 20px;">End Date:</div>
		</div>
	*/
	$("#dateRangeLabelStart").text(`Filter by Date: ${startStr}`);
	$("#dateRangeLabelEnd").text(`${endStr}`);
}
  
// ---------------
// Populate region dropdown
function populateRegionDropdown(rows) {
	const regionSet = new Set();
	rows.forEach(row => {
		if (row.region) regionSet.add(row.region);
	});

	const regionSelect = document.getElementById('regionSelect');
	
	// Sort them alphabetically (or not)
	const sortedRegions = Array.from(regionSet).sort();

	sortedRegions.forEach(regionValue => {
		const opt = document.createElement('option');
		opt.value = regionValue;
		opt.textContent = regionValue;
		regionSelect.appendChild(opt);
	});

	// Listen for changes
	regionSelect.addEventListener('change', () => {
		renderAllCharts();
	});
}

// ---------------
// Render all charts (line, bar, pie)
function renderAllCharts() {
	// Check current region filter
	const regionFilter = document.getElementById('regionSelect').value;

	// Get slider positions
	const sliderValues = $("#dateSlider").slider("values"); 
	const offsetMin = sliderValues[0];
	const offsetMax = sliderValues[1];

	// Filter data
	const filtered = rawData.filter(row => {
		if (regionFilter && row.region !== regionFilter) return false;

		if (row.offsetDays === null) return false;
		if (row.offsetDays < offsetMin || row.offsetDays > offsetMax) return false;

		return true;
	});

	// Render each chart
	renderLineChart(filtered);
	renderBarChart(filtered);
	renderPieChart(filtered);
	renderMapChart(filtered);
}

// ---------------
// Choropleth map for Austria
function renderMapChart(data) {
	// We'll fetch the geojson every time or just once. Let's do it once for simplicity.
	// Option A: fetch each time. Option B: store in a global variable. 
	fetch('data/oesterreich.json')
		.then(resp => resp.json())
		.then(geoData => {
			const regionFilter = document.getElementById('regionSelect').value;
			const isRelative = document.getElementById('toggleFilterMap').checked;

			// Aggregate CSV by region -> count
			const regionCounts = new Map();
			data.forEach(row => {
				const reg = row.region;
				if (!reg) return;
				const oldVal = regionCounts.get(reg) || 0;
				regionCounts.set(reg, oldVal + 1);
			});

			// Build arrays for Plotly
			const locations = [];
			const zValues = [];
			regionCounts.forEach((count, regionName) => {
				locations.push(regionName);
				if (isRelative) {
					const total = citicenPerRegion[regionName] || 1;
					zValues.push(count / total * 100);
					return;
				}
				zValues.push(count);
			});

			const maxCount = zValues.length ? Math.max(...zValues) : 0;

			const trace = {
				type: 'choroplethmapbox',
				geojson: geoData,
				locations: locations,
				z: zValues,
				featureidkey: 'properties.name',
				colorscale: [[0, 'lightblue'], [1, 'blue']],
				zmin: 0,
				zmax: maxCount,
				marker: { line: { width: 1, color: 'gray' }},
				hovertemplate: isRelative
					? '%{location}<br>%{z:.2f}%<extra></extra>'
					: '%{location}<br>Count: %{z}<extra></extra>',
			};

			// Decide on center/zoom
			let mapCenter = { lat: 47.7, lon: 13.3 };
			let mapZoom = 5.2;
	
			if (regionFilter && regionView[regionFilter]) {
				mapCenter = regionView[regionFilter].center;
				mapZoom = regionView[regionFilter].zoom;
			}

			const viewWidth = window.innerWidth;
			const zoomToApply = (mapZoom / 4 * 3) + (mapZoom / 4 * 1) * viewWidth / 1500;

			const layout = {
				title: 'Devices by Region',
				mapbox: {
					style: 'open-street-map',
					center: mapCenter,
					zoom: zoomToApply,
				},
				margin: { t: 40, b: 0 }
			};

			const config = { responsive: true };

			Plotly.newPlot('chart-map', [trace], layout, config)
				.then((gd) => {
					gd.on('plotly_click', function(eventData) {
						if (eventData && eventData.points && eventData.points.length > 0) {
							const clickedRegion = eventData.points[0].location;
				
							const regionSelect = document.getElementById('regionSelect');
							regionSelect.value = clickedRegion;
				
							renderAllCharts();
						}
					});

					gd.on('plotly_doubleclick', function(eventData) {
						const regionSelect = document.getElementById('regionSelect');
						regionSelect.value = '';
						renderAllCharts();
					});
				}
			);
		})
		.catch(err => console.error('Failed to load GeoJSON:', err));
}

// ---------------
// Line chart over time
function renderLineChart(data) {
	// Group data by date
	const dateCounts = new Map();
	data.forEach(row => {
		const dateStr = parseDateDDMMYYYY(row.device_created_day);
		if (!dateStr) return;
		const currentVal = dateCounts.get(dateStr) || 0;
		dateCounts.set(dateStr, currentVal + 1);
	});

	// Sort by date
	const sortedKeys = Array.from(dateCounts.keys()).sort((a, b) => new Date(a) - new Date(b));
	const xValues = sortedKeys;
	const yValues = sortedKeys.map(k => dateCounts.get(k));

	const trace = {
		x: xValues,
		y: yValues,
		type: 'scatter',
		mode: 'lines+markers',
		name: 'Devices Created'
	};

	const layout = {
		title: 'Devices Over Time',
		xaxis: { title: 'Date' },
		yaxis: { title: 'Count' }
	};

	Plotly.newPlot('chart-line', [trace], layout);
}

// ---------------
// Bar chart showing device_type_category distribution
function renderBarChart(data) {
	// Count how many rows for each device_type_category
	const typeCounts = new Map();
	data.forEach(row => {
		const cat = row.device_type_category || 'Unknown';
		const currentVal = typeCounts.get(cat) || 0;
		typeCounts.set(cat, currentVal + 1);
	});

	// Convert to arrays
	const categories = Array.from(typeCounts.keys());
	const counts = categories.map(c => typeCounts.get(c));

	const trace = {
		x: categories,
		y: counts,
		type: 'bar'
	};

	const layout = {
		title: 'Device Types',
		xaxis: { title: 'Category' },
		yaxis: { title: 'Count' }
	};

	Plotly.newPlot('chart-bar', [trace], layout);
}

// ---------------
// Pie chart showing distribution of 'product'
function renderPieChart(data) {
	// Count how many rows for each product
	const productCounts = new Map();
	data.forEach(row => {
		const product = row.product || 'Unknown';
		const currentVal = productCounts.get(product) || 0;
		productCounts.set(product, currentVal + 1);
	});

	const labels = Array.from(productCounts.keys());
	const values = labels.map(l => productCounts.get(l));

	const trace = {
		labels: labels,
		values: values,
		type: 'pie'
	};

	const layout = {
		title: 'Product Distribution'
	};

	Plotly.newPlot('chart-pie', [trace], layout);
}

// ---------------
// Utility: parse "DD.MM.YYYY" -> "YYYY-MM-DD"
function parseDateDDMMYYYY(dateStr) {
	if (!dateStr) return null;
	const [day, month, year] = dateStr.split('.');
	if (!day || !month || !year) return null;

	// Create date object
	const dateObj = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
	// Return ISO-like string "YYYY-MM-DD"
	return dateObj.toISOString().split('T')[0];
}

// dayDifference(d1, d2): how many days from d1 to d2 (integer)
function dayDifference(d1, d2) {
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.floor((d2 - d1) / msPerDay);
}

// addDays(dateObj, n): returns new Date object = dateObj + n days
function addDays(baseDate, daysToAdd) {
	const newDate = new Date(baseDate.getTime());
	newDate.setDate(newDate.getDate() + daysToAdd);
	return newDate;
}