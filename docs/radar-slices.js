// The MIT License (MIT)
//
// Copyright (c) 2017-2024 Zalando SE
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

function radar_visualization(config) {

  config.svg_id = config.svg || "radar";
  config.width = config.width || 1450;
  config.height = config.height || 1000;
  config.colors = ("colors" in config) ? config.colors : {
      background: "#fff",
      grid: '#dddde0',
      inactive: "#ddd"
    };
  config.print_layout = ("print_layout" in config) ? config.print_layout : true;
  config.links_in_new_tabs = ("links_in_new_tabs" in config) ? config.links_in_new_tabs : true;
  config.repo_url = config.repo_url || '#';
  config.print_ring_descriptions_table = ("print_ring_descriptions_table" in config) ? config.print_ring_descriptions_table : false;

  // custom random number generator, to make random sequence reproducible
  // source: https://stackoverflow.com/questions/521295
  var seed = 42;
  function random() {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  function random_between(min, max) {
    return min + random() * (max - min);
  }

  function normal_between(min, max) {
    return min + (random() + random()) * 0.5 * (max - min);
  }

  const numSlices = config.quadrants.length; // generalized: any number of categories
  const numRings = config.rings.length;

  const rings = config.rings.map((_, idx) => ({ radius: [130, 220, 310, 400][idx] || (130 + idx * 90) }));

  function polar(cartesian) {
    var x = cartesian.x;
    var y = cartesian.y;
    return {
      t: Math.atan2(y, x),
      r: Math.sqrt(x * x + y * y)
    }
  }

  function cartesian(polar) {
    return {
      x: polar.r * Math.cos(polar.t),
      y: polar.r * Math.sin(polar.t)
    }
  }

  function bounded_interval(value, min, max) {
    var low = Math.min(min, max);
    var high = Math.max(min, max);
    return Math.min(Math.max(value, low), high);
  }

  function bounded_ring(polarValue, r_min, r_max) {
    return {
      t: polarValue.t,
      r: bounded_interval(polarValue.r, r_min, r_max)
    }
  }

  function normalize_angle(theta) {
    // normalize to [0, 2π)
    var twoPi = Math.PI * 2;
    return ((theta % twoPi) + twoPi) % twoPi;
  }

  function clamp_angle(theta, minT, maxT) {
    // Assumes minT <= maxT and both in [0,2π)
    var t = normalize_angle(theta);
    if (t < minT) return minT;
    if (t > maxT) return maxT;
    return t;
  }

  function slice_angles(sliceIndex) {
    var twoPi = Math.PI * 2;
    var sliceSize = twoPi / numSlices;
    var minT = sliceIndex * sliceSize;
    var maxT = (sliceIndex + 1) * sliceSize;
    return { minT, maxT };
  }

  function segment(sliceIndex, ringIndex) {
    var angles = slice_angles(sliceIndex);
    var polar_min = {
      t: angles.minT,
      r: ringIndex === 0 ? 30 : rings[ringIndex - 1].radius
    };
    var polar_max = {
      t: angles.maxT,
      r: rings[ringIndex].radius
    };
    return {
      clipx: function(d) {
        var p = polar(d);
        var t = clamp_angle(p.t, polar_min.t, polar_max.t);
        var r = bounded_interval(p.r, polar_min.r + 15, polar_max.r - 15);
        var c = cartesian({ t: t, r: r });
        d.x = c.x; // adjust data too
        return d.x;
      },
      clipy: function(d) {
        var p = polar(d);
        var t = clamp_angle(p.t, polar_min.t, polar_max.t);
        var r = bounded_interval(p.r, polar_min.r + 15, polar_max.r - 15);
        var c = cartesian({ t: t, r: r });
        d.y = c.y; // adjust data too
        return d.y;
      },
      random: function() {
        return cartesian({
          t: random_between(polar_min.t, polar_max.t),
          r: normal_between(polar_min.r, polar_max.r)
        });
      }
    }
  }

  // position each entry randomly in its segment
  for (var i = 0; i < config.entries.length; i++) {
    var entry = config.entries[i];
    entry.segment = segment(entry.quadrant, entry.ring);
    var point = entry.segment.random();
    entry.x = point.x;
    entry.y = point.y;
    entry.color = entry.active || config.print_layout ?
      config.rings[entry.ring].color : config.colors.inactive;
  }

  // partition entries according to segments
  var segmented = new Array(numSlices);
  for (let s = 0; s < numSlices; s++) {
    segmented[s] = new Array(numRings);
    for (var r = 0; r < numRings; r++) {
      segmented[s][r] = [];
    }
  }
  for (var i = 0; i < config.entries.length; i++) {
    var entry = config.entries[i];
    segmented[entry.quadrant][entry.ring].push(entry);
  }

  // assign unique sequential id to each entry
  var id = 1;
  for (let s = 0; s < numSlices; s++) {
    for (var r = 0; r < numRings; r++) {
      var entries = segmented[s][r];
      entries.sort(function(a, b) { return a.label.localeCompare(b.label); })
      for (var k = 0; k < entries.length; k++) {
        entries[k].id = "" + id++;
      }
    }
  }

  function translate(x, y) {
    return "translate(" + x + "," + y + ")";
  }

  // adjust with config.scale.
  config.scale = config.scale || 1;
  var scaled_width = config.width * config.scale;
  var scaled_height = config.height * config.scale;

  var svg = d3.select("svg#" + config.svg_id)
    .style("background-color", config.colors.background)
    .attr("width", scaled_width)
    .attr("height", scaled_height);

  var radar = svg.append("g");
  radar.attr("transform", translate(scaled_width / 2, scaled_height / 2).concat(`scale(${config.scale})`));

  var grid = radar.append("g");

  // define default font-family
  config.font_family = config.font_family || "Arial, Helvetica";

  // draw radial slice separators
  for (let s = 0; s < numSlices; s++) {
    var angles = slice_angles(s);
    var rOuter = rings[numRings - 1].radius;
    [angles.minT].forEach(function(t) {
      var p1 = cartesian({ t: t, r: 0 });
      var p2 = cartesian({ t: t, r: rOuter });
      grid.append("line")
        .attr("x1", p1.x).attr("y1", p1.y)
        .attr("x2", p2.x).attr("y2", p2.y)
        .style("stroke", config.colors.grid)
        .style("stroke-width", 1);
    });
  }

  // draw rings
  for (var i = 0; i < rings.length; i++) {
    grid.append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", rings[i].radius)
      .style("fill", "none")
      .style("stroke", config.colors.grid)
      .style("stroke-width", 1);
    if (config.print_layout) {
      grid.append("text")
        .text(config.rings[i].name)
        .attr("y", -rings[i].radius + 62)
        .attr("text-anchor", "middle")
        .style("fill", config.rings[i].color)
        .style("opacity", 0.35)
        .style("font-family", config.font_family)
        .style("font-size", "42px")
        .style("font-weight", "bold")
        .style("pointer-events", "none")
        .style("user-select", "none");
    }
  }

  // rollover bubble (on top of everything else)
  var bubble = radar.append("g")
    .attr("id", "bubble")
    .attr("x", 0)
    .attr("y", 0)
    .style("opacity", 0)
    .style("pointer-events", "none")
    .style("user-select", "none");
  bubble.append("rect")
    .attr("rx", 4)
    .attr("ry", 4)
    .style("fill", "#333");
  bubble.append("text")
    .style("font-family", config.font_family)
    .style("font-size", "10px")
    .style("fill", "#fff");
  bubble.append("path")
    .attr("d", "M 0,0 10,0 5,8 z")
    .style("fill", "#333");

  function showBubble(d) {
    if (d.active || config.print_layout) {
      var tooltip = d3.select("#bubble text")
        .text(d.label);
      var bbox = tooltip.node().getBBox();
      d3.select("#bubble")
        .attr("transform", translate(d.x - bbox.width / 2, d.y - 16))
        .style("opacity", 0.8);
      d3.select("#bubble rect")
        .attr("x", -5)
        .attr("y", -bbox.height)
        .attr("width", bbox.width + 10)
        .attr("height", bbox.height + 4);
      d3.select("#bubble path")
        .attr("transform", translate(bbox.width / 2 - 5, 3));
    }
  }

  function hideBubble(d) {
    var bubble = d3.select("#bubble")
      .attr("transform", translate(0,0))
      .style("opacity", 0);
  }

  // layer for entries
  var rink = radar.append("g")
    .attr("id", "rink");

  // draw blips on radar
  var blips = rink.selectAll(".blip")
    .data(config.entries)
    .enter()
      .append("g")
        .attr("class", "blip")
        .on("mouseover", function(event, d) { showBubble(d); })
        .on("mouseout", function(event, d) { hideBubble(d); });

  // configure each blip
  blips.each(function(d) {
    var blip = d3.select(this);

    if (d.active && Object.prototype.hasOwnProperty.call(d, "link") && d.link) {
      blip = blip.append("a")
        .attr("xlink:href", d.link);
      if (config.links_in_new_tabs) {
        blip.attr("target", "_blank");
      }
    }

    if (d.moved == 1) {
      blip.append("path")
        .attr("d", "M -11,5 11,5 0,-13 z")
        .style("fill", d.color);
    } else if (d.moved == -1) {
      blip.append("path")
        .attr("d", "M -11,-5 11,-5 0,13 z")
        .style("fill", d.color);
    } else if (d.moved == 2) {
      blip.append("path")
        .attr("d", d3.symbol().type(d3.symbolStar).size(200))
        .style("fill", d.color);
    } else {
      blip.append("circle")
        .attr("r", 9)
        .attr("fill", d.color);
    }

    if (d.active || config.print_layout) {
      var blip_text = config.print_layout ? d.id : d.label.match(/[a-z]/i);
      blip.append("text")
        .text(blip_text)
        .attr("y", 3)
        .attr("text-anchor", "middle")
        .style("fill", "#fff")
        .style("font-family", config.font_family)
        .style("font-size", function(d) { return blip_text.length > 2 ? "8px" : "9px"; })
        .style("pointer-events", "none")
        .style("user-select", "none");
    }
  });

  // make sure that blips stay inside their segment
  function ticked() {
    blips.attr("transform", function(d) {
      return translate(d.segment.clipx(d), d.segment.clipy(d));
    })
  }

  // distribute blips, while avoiding collisions
  d3.forceSimulation()
    .nodes(config.entries)
    .velocityDecay(0.19)
    .force("collision", d3.forceCollide().radius(12).strength(0.85))
    .on("tick", ticked);

  // simple right-side stacked legend grouped by slice and ring
  if (config.print_layout) {
    var legend = radar.append("g");
    var startX = 500;
    var startY = -400;
    var lineHeight = 12;
    var cursorY = startY;

    legend.append("a")
      .attr("href", config.repo_url)
      .attr("transform", translate(startX, cursorY - 25))
      .append("text")
      .text(config.title)
      .style("font-family", config.font_family)
      .style("font-size", "18px")
      .style("font-weight", "bold");

    for (let s = 0; s < numSlices; s++) {
      legend.append("text")
        .attr("transform", translate(startX, cursorY))
        .text(config.quadrants[s].name)
        .style("font-family", config.font_family)
        .style("font-size", "14px")
        .style("font-weight", "bold");
      cursorY += lineHeight + 4;

      for (let r = 0; r < numRings; r++) {
        legend.append("text")
          .attr("transform", translate(startX, cursorY))
          .text(config.rings[r].name)
          .style("font-family", config.font_family)
          .style("font-size", "12px")
          .style("font-weight", "bold")
          .style("fill", config.rings[r].color);
        cursorY += lineHeight;

        legend.selectAll(".legend" + s + r)
          .data(segmented[s][r])
          .enter()
            .append("a")
              .attr("href", function(d, i) { return d.link ? d.link : "#"; })
              .attr("target", function(d, i) { return (d.link && config.links_in_new_tabs) ? "_blank" : null; })
            .append("text")
              .attr("transform", function(d, i) { return translate(startX, cursorY + i * lineHeight); })
              .attr("class", "legend" + s + r)
              .text(function(d) { return d.id + ". " + d.label; })
              .style("font-family", config.font_family)
              .style("font-size", "11px");
        cursorY += segmented[s][r].length * lineHeight + lineHeight;
      }

      cursorY += lineHeight; // spacing between slices
    }
  }

  function ringDescriptionsTable() {
    var table = d3.select("body").append("table")
      .attr("class", "radar-table")
      .style("border-collapse", "collapse")
      .style("position", "relative")
      .style("top", "-70px")
      .style("margin-left", "50px")
      .style("margin-right", "50px")
      .style("font-family", config.font_family)
      .style("font-size", "13px")
      .style("text-align", "left");

    var thead = table.append("thead");
    var tbody = table.append("tbody");

    var columnWidth = `${100 / config.rings.length}%`;

    var headerRow = thead.append("tr")
      .style("border", "1px solid #ddd");

    headerRow.selectAll("th")
      .data(config.rings)
      .enter()
      .append("th")
      .style("padding", "8px")
      .style("border", "1px solid #ddd")
      .style("background-color", d => d.color)
      .style("color", "#fff")
      .style("width", columnWidth)
      .text(d => d.name);

    var descriptionRow = tbody.append("tr")
      .style("border", "1px solid #ddd");

    descriptionRow.selectAll("td")
      .data(config.rings)
      .enter()
      .append("td")
      .style("padding", "8px")
      .style("border", "1px solid #ddd")
      .style("width", columnWidth)
      .text(d => d.description);
  }

  if (config.print_ring_descriptions_table) {
    ringDescriptionsTable();
  }
}


