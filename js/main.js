// Define chart dimensions and layout margins.
const margin = { top: 60, right: 30, bottom: 95, left: 72 };
const width = 920 - margin.left - margin.right;
const height = 480 - margin.top - margin.bottom;

// Define line chart dimensions.
const margin2 = { top: 44, right: 34, bottom: 68, left: 72 };
const height2 = 320 - margin2.top - margin2.bottom;

// Map metric keys to readable labels.
const metrics = {
    TMAX: "Avg Max Temperature (°F)",
    TMIN: "Avg Min Temperature (°F)",
    TAVG: "Avg Temperature (°F)",
    PRCP: "Avg Precipitation (in)",
    SNOW: "Avg Snowfall (in)"
};

// Provide month labels for filter controls.
const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

// Store current interaction and filter state.
let selectedState = null;
let brushedStates = [];
let currentMetric = "TMAX";
let monthStart = 1;
let monthEnd = 12;
let topN = 0;
let weatherData = [];
let barData = [];

// Store derived data for current view.
let xLineBase = null;
let yLineCurrent = null;
let renderedLineSeries = [];
let linePointsFlat = [];

// Create the primary bar chart SVG group.
const svg = d3.select("#chart")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Create the line chart root SVG.
const svg2Root = d3.select("#chart2")
    .attr("width", width + margin2.left + margin2.right)
    .attr("height", height2 + margin2.top + margin2.bottom);

// Create the translated group used to draw line chart content.
const svg2 = svg2Root.append("g")
    .attr("transform", `translate(${margin2.left},${margin2.top})`);

// Add a clipping region so zoomed content stays inside the plot area.
svg2Root.append("defs")
    .append("clipPath")
    .attr("id", "line-clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height2);

// Build the shared tooltip used for bars and line points.
const tooltip = d3.select("body")
    .append("div")
    .attr("id", "tooltip")
    .style("position", "absolute")
    .style("background", "#ffffff")
    .style("border", "1px solid #d7deea")
    .style("padding", "8px 10px")
    .style("border-radius", "6px")
    .style("box-shadow", "0 3px 12px rgba(50, 60, 80, 0.12)")
    .style("pointer-events", "none")
    .style("font-size", "12px")
    .style("line-height", "1.35")
    .style("opacity", 0);

// Create layer groups for bars and brushing.
const barsLayer = svg.append("g");
const brushLayer = svg.append("g").attr("class", "brush-layer");

// Create axes and grid containers for the bar chart.
const yGridG = svg.append("g").attr("class", "grid");
const xAxisG = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`);
const yAxisG = svg.append("g").attr("class", "axis");

// Add bar chart y-axis title.
const yLabel = svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -56)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "#55657c");

// Add bar chart x-axis title.
svg.append("text")
    .attr("x", width / 2)
    .attr("y", height + 74)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "#5d6d82")
    .text("State");

// Add bar chart interaction hint text.
svg.append("text")
    .attr("x", width / 2)
    .attr("y", -24)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "#6b7c92")
    .attr("font-style", "italic")
    .text("Drag on bars to brush-select states and link trends below");

// Create axes and grid containers for the line chart.
const xAxisG2 = svg2.append("g").attr("class", "axis").attr("transform", `translate(0,${height2})`);
const yAxisG2 = svg2.append("g").attr("class", "axis");
const yGridG2 = svg2.append("g").attr("class", "grid");

// Add line chart title text element.
const lineTitle = svg2.append("text")
    .attr("x", width / 2)
    .attr("y", -16)
    .attr("text-anchor", "middle")
    .attr("font-size", "14px")
    .attr("font-weight", "600")
    .attr("fill", "#334155");

// Add line chart y-axis title.
const yLabel2 = svg2.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -height2 / 2)
    .attr("y", -56)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "#55657c");

// Add line chart x-axis title.
svg2.append("text")
    .attr("x", width / 2)
    .attr("y", height2 + 48)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "#5d6d82")
    .text("Month");

// Create layers for clipped line marks, annotations, and legend.
const clippedLayer = svg2.append("g").attr("clip-path", "url(#line-clip)");
const lineLayer = clippedLayer.append("g");
const dotsLayer = clippedLayer.append("g");
const annotationLayer = svg2.append("g");

const legendG = svg2.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width + 42},8)`);

// Get references to all interactive control elements.
const metricSelect = d3.select("#metricSelect");
const monthStartSelect = d3.select("#monthStartSelect");
const monthEndSelect = d3.select("#monthEndSelect");
const topNSelect = d3.select("#topNSelect");

// Populate metric dropdown options.
Object.entries(metrics).forEach(([key, label]) => {
    metricSelect.append("option").attr("value", key).text(label);
});

// Populate month range dropdown options.
months.forEach((month, index) => {
    monthStartSelect.append("option").attr("value", index + 1).text(month);
    monthEndSelect.append("option").attr("value", index + 1).text(month);
});

// Initialize default control values.
metricSelect.property("value", currentMetric);
monthStartSelect.property("value", monthStart);
monthEndSelect.property("value", monthEnd);

// Load CSV data, parse fields, and wire initial interactions.
d3.csv("weather_trimmed.csv").then(data => {
    const parseDate = d3.timeParse("%Y%m%d");

    // Convert each row into typed values used by visual encodings.
    weatherData = data.map(d => {
        const parsedDate = parseDate(d.date);
        const row = {
            ...d,
            date: parsedDate,
            month: parsedDate ? parsedDate.getMonth() + 1 : null
        };

        ["TMIN", "TMAX", "TAVG", "AWND", "WSF5", "SNOW", "SNWD", "PRCP"].forEach(col => {
            row[col] = row[col] === "" ? null : +row[col];
        });

        return row;
    });

    // Connect control events and render the first view.
    wireControls();
    renderAll();

    // Reset line chart zoom to the default domain.
    d3.select("#resetZoomBtn").on("click", () => {
        svg2Root.transition().duration(350).call(zoomBehavior.transform, d3.zoomIdentity);
    });

    // Clear selected and brushed states, then redraw.
    d3.select("#clearSelectionBtn").on("click", () => {
        selectedState = null;
        brushedStates = [];
        brushLayer.call(brush.move, null);
        renderBars();
        updateLineChart();
    });
});

// Wire all control change listeners to reactive updates.
function wireControls() {
    metricSelect.on("change", function () {
        currentMetric = this.value;
        renderAll();
    });

    monthStartSelect.on("change", function () {
        monthStart = +this.value;
        if (monthStart > monthEnd) {
            monthEnd = monthStart;
            monthEndSelect.property("value", monthEnd);
        }
        renderAll();
    });

    monthEndSelect.on("change", function () {
        monthEnd = +this.value;
        if (monthEnd < monthStart) {
            monthStart = monthEnd;
            monthStartSelect.property("value", monthStart);
        }
        renderAll();
    });

    topNSelect.on("change", function () {
        topN = +this.value;
        renderAll();
    });
}

// Check whether a row falls within the selected month range.
function inMonthRange(d) {
    return d.month >= monthStart && d.month <= monthEnd;
}

// Return rows filtered by current metric and month range.
function getFilteredRows(metric) {
    return weatherData.filter(d => d[metric] !== null && d.date && inMonthRange(d));
}

// Aggregate filtered rows by state for the bar chart.
function buildBarData(metric) {
    let rows = d3.rollups(
        getFilteredRows(metric),
        values => d3.mean(values, v => v[metric]),
        d => d.state
    ).map(([state, value]) => ({ state, value }))
    .sort((a, b) => d3.descending(a.value, b.value));

    if (topN > 0) {
        rows = rows.slice(0, topN);
    }

    return rows;
}

// Recompute data and refresh both coordinated views.
function renderAll() {
    barData = buildBarData(currentMetric);

    if (selectedState && !barData.find(d => d.state === selectedState)) {
        selectedState = null;
    }

    if (brushedStates.length > 0) {
        brushedStates = brushedStates.filter(state => barData.find(d => d.state === state));
    }

    renderBars();
    updateLineChart();
}

// Compute bar color based on current selection state.
function barFillForState(state) {
    if (selectedState === state) return "#eb7f3a";
    if (brushedStates.includes(state)) return "#5a8fd9";
    return "#9cc0ee";
}

// Render bars, bar axes, and bar-level interactions.
function renderBars() {
    const x = d3.scaleBand()
        .domain(barData.map(d => d.state))
        .range([0, width])
        .padding(0.22);

    const yMax = d3.max(barData, d => d.value) || 1;
    const y = d3.scaleLinear()
        .domain([0, yMax * 1.12])
        .range([height, 0]);

    yGridG
        .transition().duration(350)
        .call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(""));

    yAxisG
        .transition().duration(350)
        .call(d3.axisLeft(y).ticks(6));

    xAxisG
        .transition().duration(350)
        .call(d3.axisBottom(x))
        .selection()
        .selectAll("text")
        .style("font-size", "11px")
        .style("fill", "#4d5f76")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");

    yLabel.text(metrics[currentMetric]);

    const bars = barsLayer.selectAll("rect.bar")
        .data(barData, d => d.state);

    bars.exit().remove();

    const barsEnter = bars.enter()
        .append("rect")
        .attr("class", "bar")
        .attr("rx", 3)
        .attr("x", d => x(d.state))
        .attr("y", height)
        .attr("width", x.bandwidth())
        .attr("height", 0)
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            d3.select(this).attr("fill", "#3f74be");
            tooltip
                .style("opacity", 1)
                .html(`<strong>${d.state}</strong><br>${metrics[currentMetric]}: ${d.value.toFixed(2)}<br><em>Click for focus, drag to brush</em>`);
        })
        .on("mousemove", function (event) {
            tooltip
                .style("left", `${event.pageX + 14}px`)
                .style("top", `${event.pageY - 30}px`);
        })
        .on("mouseout", function (event, d) {
            d3.select(this).attr("fill", barFillForState(d.state));
            tooltip.style("opacity", 0);
        })
        .on("click", function (event, d) {
            selectedState = d.state;
            brushedStates = [];
            brushLayer.call(brush.move, null);
            renderBars();
            updateLineChart();
        });

    barsEnter.merge(bars)
        .transition().duration(400)
        .attr("x", d => x(d.state))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.value))
        .attr("height", d => height - y(d.value))
        .attr("fill", d => barFillForState(d.state));

    attachBrush(x);
}

// Configure horizontal brush for linked state selection.
const brush = d3.brushX()
    .extent([[0, 0], [width, height]])
    .on("brush end", ({ selection }) => {
        if (!selection) {
            brushedStates = [];
            renderBars();
            updateLineChart();
            return;
        }

        const [x0, x1] = selection;
        const brushed = barData
            .filter(d => {
                const center = currentBandScale(d.state) + currentBandScale.bandwidth() / 2;
                return center >= x0 && center <= x1;
            })
            .map(d => d.state);

        brushedStates = brushed;

        if (brushedStates.length > 0) {
            selectedState = null;
        }

        renderBars();
        updateLineChart();
    });

// Store current x band scale and attach brush behavior.
let currentBandScale = null;

function attachBrush(xScale) {
    currentBandScale = xScale;
    brushLayer.call(brush);
}

// Resolve active states from brush or single selection.
function getActiveStates() {
    if (brushedStates.length > 0) return brushedStates;
    if (selectedState) return [selectedState];
    return [];
}

// Build time-series data for active states and optional average.
function buildLineSeries(metric, states) {
    const series = states.map(state => {
        const values = d3.rollups(
            getFilteredRows(metric).filter(d => d.state === state),
            v => d3.mean(v, row => row[metric]),
            d => +d.date
        ).map(([time, value]) => ({
            state,
            date: new Date(+time),
            value
        })).sort((a, b) => a.date - b.date);

        return { state, values };
    }).filter(s => s.values.length > 0);

    if (series.length > 1) {
        const all = series.flatMap(s => s.values);
        const avgByDate = d3.rollups(
            all,
            values => d3.mean(values, d => d.value),
            d => +d.date
        ).map(([time, value]) => ({
            state: "Selected Avg",
            date: new Date(+time),
            value
        })).sort((a, b) => a.date - b.date);

        series.push({ state: "Selected Avg", values: avgByDate, aggregate: true });
    }

    return series;
}

// Render and update the linked line chart panel.
function updateLineChart() {
    const activeStates = getActiveStates();

    if (activeStates.length === 0) {
        d3.select("#chart2-section").style("display", "none");
        return;
    }

    d3.select("#chart2-section").style("display", "block");

    renderedLineSeries = buildLineSeries(currentMetric, activeStates);

    linePointsFlat = renderedLineSeries.flatMap(s => s.values.map(v => ({ ...v, key: s.state, aggregate: !!s.aggregate })));

    const xExtent = d3.extent(linePointsFlat, d => d.date);
    const yExtent = d3.extent(linePointsFlat, d => d.value);

    const yPad = ((yExtent[1] || 1) - (yExtent[0] || 0)) * 0.15;

    xLineBase = d3.scaleTime()
        .domain(xExtent)
        .range([0, width]);

    yLineCurrent = d3.scaleLinear()
        .domain([Math.max(0, yExtent[0] - yPad), yExtent[1] + yPad])
        .nice()
        .range([height2, 0]);

    yGridG2
        .transition().duration(350)
        .call(d3.axisLeft(yLineCurrent).ticks(5).tickSize(-width).tickFormat(""));

    xAxisG2
        .transition().duration(350)
        .call(d3.axisBottom(xLineBase).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b")));

    yAxisG2
        .transition().duration(350)
        .call(d3.axisLeft(yLineCurrent).ticks(5));

    yLabel2.text(metrics[currentMetric]);

    const titleContext = brushedStates.length > 0
        ? `${brushedStates.length} brushed states`
        : selectedState;

    lineTitle.text(`${metrics[currentMetric]} Over Time: ${titleContext}`);

    drawLineSeries(xLineBase);
    drawLegend();
    drawAnnotations(xLineBase);

    svg2Root.call(zoomBehavior).call(zoomBehavior.transform, d3.zoomIdentity);
}

// Draw line paths and points for the current x scale.
function drawLineSeries(xScale) {
    const color = d3.scaleOrdinal()
        .domain(renderedLineSeries.map(s => s.state))
        .range(d3.schemeTableau10);

    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yLineCurrent(d.value));

    const lines = lineLayer.selectAll("path.line-path")
        .data(renderedLineSeries, d => d.state);

    lines.exit().remove();

    lines.enter()
        .append("path")
        .attr("class", "line-path")
        .merge(lines)
        .attr("fill", "none")
        .attr("stroke", d => d.aggregate ? "#e07b39" : color(d.state))
        .attr("stroke-width", d => d.aggregate ? 2.8 : 1.8)
        .attr("stroke-opacity", d => d.aggregate ? 1 : 0.85)
        .attr("d", d => line(d.values));

    const points = dotsLayer.selectAll("circle.dot")
        .data(linePointsFlat, d => `${d.key}-${+d.date}`);

    points.exit().remove();

    points.enter()
        .append("circle")
        .attr("class", "dot")
        .merge(points)
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yLineCurrent(d.value))
        .attr("r", d => d.aggregate ? 3 : 2.2)
        .attr("fill", d => d.aggregate ? "#e07b39" : color(d.key))
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.9)
        .on("mouseover", function (event, d) {
            d3.select(this).attr("r", d.aggregate ? 4 : 3.2);
            tooltip
                .style("opacity", 1)
                .html(`<strong>${d.key}</strong><br>${d3.timeFormat("%b %d")(d.date)}<br>${metrics[currentMetric]}: ${d.value.toFixed(2)}`);
        })
        .on("mousemove", function (event) {
            tooltip
                .style("left", `${event.pageX + 14}px`)
                .style("top", `${event.pageY - 30}px`);
        })
        .on("mouseout", function (event, d) {
            d3.select(this).attr("r", d.aggregate ? 3 : 2.2);
            tooltip.style("opacity", 0);
        });
}

// Draw a compact legend for visible line series.
function drawLegend() {
    const legendItems = renderedLineSeries.map(s => ({ state: s.state, aggregate: !!s.aggregate }));

    const color = d3.scaleOrdinal()
        .domain(legendItems.map(d => d.state))
        .range(d3.schemeTableau10);

    const items = legendG.selectAll("g.legend-item")
        .data(legendItems, d => d.state);

    items.exit().remove();

    const enter = items.enter().append("g").attr("class", "legend-item");

    enter.append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("rx", 2)
        .attr("y", -8);

    enter.append("text")
        .attr("x", 14)
        .attr("y", 0)
        .attr("font-size", "11px")
        .attr("fill", "#48576d");

    const merged = enter.merge(items)
        .attr("transform", (d, i) => `translate(0, ${i * 14})`);

    merged.select("rect")
        .attr("fill", d => d.aggregate ? "#e07b39" : color(d.state));

    merged.select("text")
        .text(d => d.state);
}

// Highlight and label min/max points as annotations.
function drawAnnotations(xScale) {
    const realSeriesPoints = linePointsFlat.filter(d => !d.aggregate);
    if (realSeriesPoints.length === 0) {
        annotationLayer.selectAll("*").remove();
        return;
    }

    const maxPoint = d3.max(realSeriesPoints, d => d.value);
    const minPoint = d3.min(realSeriesPoints, d => d.value);

    const maxDatum = realSeriesPoints.find(d => d.value === maxPoint);
    const minDatum = realSeriesPoints.find(d => d.value === minPoint);

    const annotationData = [
        { ...maxDatum, label: "Max" },
        { ...minDatum, label: "Min" }
    ];

    const points = annotationLayer.selectAll("circle.annotation-point")
        .data(annotationData, d => d.label);

    points.exit().remove();

    points.enter()
        .append("circle")
        .attr("class", "annotation-point")
        .merge(points)
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yLineCurrent(d.value))
        .attr("r", 5)
        .attr("fill", d => d.label === "Max" ? "#be123c" : "#0f766e")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.2);

    const labels = annotationLayer.selectAll("text.annotation-label")
        .data(annotationData, d => d.label);

    labels.exit().remove();

    labels.enter()
        .append("text")
        .attr("class", "annotation-label")
        .merge(labels)
        .attr("x", d => xScale(d.date) + 8)
        .attr("y", d => yLineCurrent(d.value) - 7)
        .attr("font-size", "11px")
        .attr("fill", "#3f4f64")
        .text(d => `${d.label}: ${d.key} (${d.value.toFixed(2)})`);
}

// Enable zooming and panning on the line chart x-axis.
const zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height2]])
    .extent([[0, 0], [width, height2]])
    .on("zoom", event => {
        if (!xLineBase || !yLineCurrent || renderedLineSeries.length === 0) return;

        const zx = event.transform.rescaleX(xLineBase);

        xAxisG2.call(d3.axisBottom(zx).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%b")));

        drawLineSeries(zx);
        drawAnnotations(zx);
    });
