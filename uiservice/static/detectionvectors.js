/**
 * Detection Vectors Intersection Analysis
 * Finds temporal-spatial intersections of detection vectors from different cameras
 */

class DetectionVectorAnalysis {
    constructor() {
        this.intersections = [];
    }

    /**
     * Calculate intersection point of two line segments in 2D space
     * Returns null if lines don't intersect or are parallel
     */
    static getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

        // Lines are parallel or coincident
        if (Math.abs(denom) < 1e-10) {
            return null;
        }

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

        // Check if intersection is within both line segments (0 to 1 for segments, allow extended for rays)
        // For rays from camera, we want to allow extension beyond segment end
        if (ua >= 0 && ub >= 0) {
            const x = x1 + ua * (x2 - x1);
            const y = y1 + ua * (y2 - y1);
            return { x, y, ua, ub };
        }

        return null;
    }

    /**
     * Convert lat/lng to canvas coordinates
     */
    static latLngToCanvas(lat, lng, minLat, maxLat, minLng, maxLng, canvasWidth, canvasHeight) {
        const x = ((lng - minLng) / (maxLng - minLng)) * canvasWidth;
        const y = canvasHeight - ((lat - minLat) / (maxLat - minLat)) * canvasHeight;
        return { x, y };
    }

    /**
     * Convert canvas coordinates back to lat/lng
     */
    static canvasToLatLng(x, y, minLat, maxLat, minLng, maxLng, canvasWidth, canvasHeight) {
        const lng = minLng + (x / canvasWidth) * (maxLng - minLng);
        const lat = minLat + ((canvasHeight - y) / canvasHeight) * (maxLat - minLat);
        return { lat, lng };
    }

    /**
     * Find all temporal-spatial intersections between detection vectors
     * Returns array of intersection objects with temporal and spatial data
     */
    findIntersections(detections, cameras, canvasWidth, canvasHeight, temporalWindowMs = 1000) {
        const TEMPORAL_WINDOW_MS = Math.max(0, Number(temporalWindowMs) || 0);
        const intersections = [];

        // Calculate bounds for projection
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        Object.values(cameras).forEach(cam => {
            if (cam.lat < minLat) minLat = cam.lat;
            if (cam.lat > maxLat) maxLat = cam.lat;
            if (cam.lng < minLng) minLng = cam.lng;
            if (cam.lng > maxLng) maxLng = cam.lng;
        });

        const latPadding = (maxLat - minLat) * 0.2 || 0.0001;
        const lngPadding = (maxLng - minLng) * 0.2 || 0.0001;
        minLat -= latPadding;
        maxLat += latPadding;
        minLng -= lngPadding;
        maxLng += lngPadding;

        // Get frame width helper
        const getFrameWidth = (cameraName) => {
            const cam = cameras[cameraName];
            return cam && cam.frameWidth ? cam.frameWidth : 704;
        };

        // Get vector endpoint helper
        const getVectorEndpoint = (detection, camera, frameWidth) => {
            const [x1, y1, x2, y2] = detection.bounding_box;
            const boxCenterXPixels = (x1 + x2) / 2.0;
            const boxCenterX = boxCenterXPixels / frameWidth;

            const fov = camera.fov || 140;
            const cameraOrientation = camera.orientation || 0;
            const heading = cameraOrientation - (fov / 2) + (boxCenterX * fov);

            const headingRad = heading * Math.PI / 180;
            const vectorLengthMeters = 33;
            const R = 6378137;
            const dLat = (vectorLengthMeters * Math.cos(headingRad)) / R * (180 / Math.PI);
            const dLng = (vectorLengthMeters * Math.sin(headingRad)) / (R * Math.cos(camera.lat * Math.PI / 180)) * (180 / Math.PI);

            return {
                startLat: camera.lat,
                startLng: camera.lng,
                endLat: camera.lat + dLat,
                endLng: camera.lng + dLng
            };
        };

        // Group detections by timestamp to find temporal matches
        const detectionsByTime = {};
        detections.forEach(det => {
            const timeKey = new Date(det.timestamp).getTime();
            if (!detectionsByTime[timeKey]) {
                detectionsByTime[timeKey] = [];
            }
            detectionsByTime[timeKey].push(det);
        });

        // Check all pairs of detections from different cameras within time window
        const uniqueIntersections = new Map(); // Use map to avoid duplicates

        Object.entries(detectionsByTime).forEach(([timeStr, detsAtTime]) => {
            const centerTime = parseInt(timeStr);

            // Also check ±10 seconds
            Object.entries(detectionsByTime).forEach(([otherTimeStr, detsAtOtherTime]) => {
                const otherTime = parseInt(otherTimeStr);
                const timeDiff = Math.abs(centerTime - otherTime);

                if (timeDiff > TEMPORAL_WINDOW_MS) return; // Outside temporal window

                // Check all pairs within this time window
                detsAtTime.forEach(det1 => {
                    detsAtOtherTime.forEach(det2 => {
                        // Skip same detection and same camera
                        if (det1.id === det2.id || det1.camera === det2.camera) return;
                        // Only compare like-type objects for positional fix
                        if (det1.type !== det2.type) return;
                        if (!cameras[det1.camera] || !cameras[det2.camera]) return;

                        const cam1 = cameras[det1.camera];
                        const cam2 = cameras[det2.camera];
                        const fw1 = getFrameWidth(det1.camera);
                        const fw2 = getFrameWidth(det2.camera);

                        const vec1 = getVectorEndpoint(det1, cam1, fw1);
                        const vec2 = getVectorEndpoint(det2, cam2, fw2);

                        // Convert to canvas coordinates
                        const start1 = this.constructor.latLngToCanvas(vec1.startLat, vec1.startLng, minLat, maxLat, minLng, maxLng, canvasWidth, canvasHeight);
                        const end1 = this.constructor.latLngToCanvas(vec1.endLat, vec1.endLng, minLat, maxLat, minLng, maxLng, canvasWidth, canvasHeight);
                        const start2 = this.constructor.latLngToCanvas(vec2.startLat, vec2.startLng, minLat, maxLat, minLng, maxLng, canvasWidth, canvasHeight);
                        const end2 = this.constructor.latLngToCanvas(vec2.endLat, vec2.endLng, minLat, maxLat, minLng, maxLng, canvasWidth, canvasHeight);

                        // Check intersection
                        const intersection = this.constructor.getLineIntersection(
                            start1.x, start1.y, end1.x, end1.y,
                            start2.x, start2.y, end2.x, end2.y
                        );

                        if (intersection && intersection.x >= 0 && intersection.x < canvasWidth &&
                            intersection.y >= 0 && intersection.y < canvasHeight) {

                            // Create unique key to avoid duplicates (order-independent)
                            const cameras_sorted = [det1.camera, det2.camera].sort().join('|');
                            const key = `${cameras_sorted}|${Math.round(intersection.x)}|${Math.round(intersection.y)}|${timeDiff}`;

                            if (!uniqueIntersections.has(key)) {
                                // Convert canvas coordinates back to GPS
                                const gps = this.constructor.canvasToLatLng(
                                    intersection.x, intersection.y,
                                    minLat, maxLat, minLng, maxLng,
                                    canvasWidth, canvasHeight
                                );

                                uniqueIntersections.set(key, {
                                    x: intersection.x,
                                    y: intersection.y,
                                    lat: gps.lat,
                                    lng: gps.lng,
                                    detections: [det1, det2],
                                    cameras: [det1.camera, det2.camera],
                                    timestamps: [new Date(det1.timestamp), new Date(det2.timestamp)],
                                    timeDiff: timeDiff
                                });
                            }
                        }
                    });
                });
            });
        });

        this.intersections = Array.from(uniqueIntersections.values());
        return this.intersections;
    }

    /**
     * Get intersections filtered by camera selection
     */
    getFilteredIntersections(selectedCameras) {
        return this.intersections.filter(intersection => {
            return intersection.cameras.every(cam => selectedCameras.has(cam));
        });
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DetectionVectorAnalysis;
}
