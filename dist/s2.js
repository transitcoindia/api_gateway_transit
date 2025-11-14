"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getS2CellId = getS2CellId;
exports.getCoveringCellIds = getCoveringCellIds;
const nodes2ts_1 = require("nodes2ts");
// Get S2 cell ID for a given lat/lng and level
function getS2CellId(lat, lng, level = 15) {
    const latLng = nodes2ts_1.S2LatLng.fromDegrees(lat, lng);
    return nodes2ts_1.S2CellId.fromPoint(latLng.toPoint()).parentL(level).id.toString();
}
// Get covering S2 cell IDs for a lat/lng and radius (in meters)
function getCoveringCellIds(lat, lng, radiusMeters, level = 15) {
    const latLng = nodes2ts_1.S2LatLng.fromDegrees(lat, lng);
    const angle = nodes2ts_1.S1Angle.radians(radiusMeters / 6371010); // Earth's radius in meters
    const cap = nodes2ts_1.S2Cap.fromAxisAngle(latLng.toPoint(), angle);
    const coverer = new nodes2ts_1.S2RegionCoverer();
    coverer.setMinLevel(level);
    coverer.setMaxLevel(level);
    coverer.setMaxCells(8);
    const covering = coverer.getCoveringCells(cap);
    return covering.map(cell => cell.id.toString());
}
