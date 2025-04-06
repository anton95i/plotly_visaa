// dashboard.js

// We'll store the raw CSV rows here so we can re-filter without parsing again
let rawData = [];

// Parse CSV and initialize everything
Papa.parse('data/data.csv', {
	download: true,
	header: true,
	complete: function(results) {
		rawData = results.data;

		// Filter out any empty rows
		rawData = rawData.filter(row => row.region && row.product && row.device_created_day);

		// Populate dropdown with unique "region" values
		populateRegionDropdown(rawData);

		// Render initial charts with "no filter" (regionSelect.value = "")
		renderAllCharts();
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
		renderAllCharts(); // Re-render all charts
	});
}

// ---------------
// Render all charts (line, bar, pie)
function renderAllCharts() {
	// Check current region filter
	const regionFilter = document.getElementById('regionSelect').value;

	// Filter data
	let filtered = rawData;
	if (regionFilter) {
		filtered = rawData.filter(row => row.region === regionFilter);
	}

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
				hovertemplate: '%{location}<br>Count: %{z}<extra></extra>'
			};

			// Decide on center/zoom
			const regionFilter = document.getElementById('regionSelect').value;
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

			Plotly.newPlot('chart-map', [trace], layout);
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
