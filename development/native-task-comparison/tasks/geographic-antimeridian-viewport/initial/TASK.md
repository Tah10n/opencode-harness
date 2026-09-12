# geographic-antimeridian-viewport

Fix integrated createViewport(points,size) in src/viewport.mjs so global points use minimal circular longitude bounds instead of min/max longitude. geographicBounds/projectPoint in src/geo.mjs remain public. Domain: dense<=1000 point records {id,lon,lat}, integer lon[-180,180],lat[-90,90], arbitrary string id, frozen allowed; invalid coordinates RangeError('point'). Canonicalize longitudes to [-180,180), so180=-180. Choose clockwise arc containing all longitudes with smallest width; if multiple equal-width arcs choose numerically smallest canonical west. Return {west,east,width,south,north,crossesAntimeridian}, east canonical west+width, crossing true iff width>0 and west>east; south/north latitude extrema. Empty bounds null. projectPoint maps a point inside bounds linearly: clockwise longitude distance/width*pixelWidth, north-to-south latitude fraction*pixelHeight. Collapsed longitude/latitude axis maps to center of that pixel axis. This is linear project policy, not Mercator. createViewport validates finite positive pixel dimensions<=10000 before points even empty (RangeError('size')), returns {bounds,markers:[{id,x,y}]} preserving point order/id with no mutation. Empty=>{bounds:null,markers:[]}. ProjectPoint inputs have valid bounds from same domain and a point within that arc/latitude range. No sorting of markers or treating 180 as a separate location.

Preserve existing public behavior and all old test coverage. Use only Node built-ins; do not add dependencies. Inputs outside the explicitly stated domain need not be accepted. Implement the change through the existing public entry points.

Add project regression tests (any test names are acceptable) that demonstrate:
- Assert antimeridian crossing bounds and integrated projected marker order.
- Assert equal-arc ties, +/-180 identity, collapsed axes, empty and invalid dimensions/points.

Update project documentation to explain:
- Explain canonical longitude, minimal arc and deterministic tie choice.
- Document linear projection, collapsed-axis centering and supported coordinate/pixel domain.

Run npm test after the last source or test change.
