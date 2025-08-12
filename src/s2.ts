import { S2CellId, S2LatLng, S2RegionCoverer, S2Cap, S1Angle } from 'nodes2ts';

// Get S2 cell ID for a given lat/lng and level
export function getS2CellId(lat: number, lng: number, level: number = 15): string {
  const latLng = S2LatLng.fromDegrees(lat, lng);
  return S2CellId.fromPoint(latLng.toPoint()).parentL(level).id.toString();
}

// Get covering S2 cell IDs for a lat/lng and radius (in meters)
export function getCoveringCellIds(lat: number, lng: number, radiusMeters: number, level: number = 15): string[] {
  const latLng = S2LatLng.fromDegrees(lat, lng);
  const angle = S1Angle.radians(radiusMeters / 6371010); // Earth's radius in meters
  const cap = S2Cap.fromAxisAngle(latLng.toPoint(), angle);
  const coverer = new S2RegionCoverer();
  coverer.setMinLevel(level);
  coverer.setMaxLevel(level);
  coverer.setMaxCells(8);
  const covering = coverer.getCoveringCells(cap);
  return covering.map(cell => cell.id.toString());
} 