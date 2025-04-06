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
// A dictionary of Austrian regions -> lat/lon
const regionCoordinates = {
	'Wien': { lat: 48.210033, lon: 16.363449 },
	'Niederösterreich': { lat: 48.1186, lon: 15.8040 },
	'Oberösterreich': { lat: 48.0000, lon: 13.9720 },
	'Salzburg': { lat: 47.8095, lon: 13.0550 },
	'Steiermark': { lat: 47.3593, lon: 15.2890 },
	'Kärnten': { lat: 46.636,  lon: 14.3122 },
	'Tirol': { lat: 47.2682,  lon: 11.4041 },
	'Vorarlberg': { lat: 47.2478, lon: 9.6016 },
	'Burgenland': { lat: 47.2167, lon: 16.3667 }
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

// -------------
// Chart 4: Map with region markers
function renderMapChart(data) {
	// Group by region -> count
	const regionCounts = new Map();
	data.forEach(row => {
		const reg = row.region;
		if (!reg) return;
		const cur = regionCounts.get(reg) || 0;
		regionCounts.set(reg, cur + 1);
	});

	// Build arrays for Plotly (lat, lon, text)
	const latArr = [];
	const lonArr = [];
	const textArr = [];
	const sizeArr = [];

	regionCounts.forEach((count, reg) => {
		// does this region have lat/lon in our dictionary?
		if (regionCoordinates[reg]) {
			latArr.push(regionCoordinates[reg].lat);
			lonArr.push(regionCoordinates[reg].lon);
			textArr.push(`${reg}: ${count}`);
			// marker size scaled by count, for example
			sizeArr.push(Math.max(count * 3, 10)); // min size = 10
		}
	});

	// Plot a scattermapbox
	const trace = {
		type: 'scattermapbox',
		lat: latArr,
		lon: lonArr,
		mode: 'markers',
		marker: {
			size: sizeArr
		},
		text: textArr,
		hoverinfo: 'text'
	};

	const layout = {
		title: 'Devices by Region',
		mapbox: {
			style: 'open-street-map',       // no access token required
			center: { lat: 47.5, lon: 14 }, // approximate center of Austria
			zoom: 4
		},
		margin: { t: 40, b: 0 }
	};

	// If you see a blank map, try removing style:'open-street-map'
	// or specify a Mapbox access token if needed.
	Plotly.newPlot('chart-map', [trace], layout);
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
