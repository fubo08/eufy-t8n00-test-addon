"""Qualify my NVR's public camera setup path. Created with Codex."""

import time
import unittest

from test_camera_views import setup_camera


class NvrAvailabilityQualification(unittest.IsolatedAsyncioTestCase):
    async def test_silent_wired_nvr_views_remain_available(self):
        cameras, _ = await setup_camera(
            codec="camera", power="wired", lastSeenMs=(time.time() - 9 * 3600) * 1000
        )
        self.assertEqual(len(cameras), 2)
        self.assertTrue(all(camera.available for camera in cameras))

    async def test_explicit_unavailable_remains_authoritative(self):
        cameras, _ = await setup_camera(
            codec="camera", power="wired", availability="unavailable"
        )
        self.assertTrue(all(not camera.available for camera in cameras))

    async def test_attached_views_silent_eight_days_are_unavailable(self):
        cameras, _ = await setup_camera(
            codec="camera", power="wired", lastSeenMs=(time.time() - 8 * 86400) * 1000
        )
        self.assertEqual(len(cameras), 2)
        self.assertTrue(all(not camera.available for camera in cameras))

    async def test_live_station_reachability_precedes_old_timestamp(self):
        cameras, _ = await setup_camera(
            codec="camera", power="wired", lastSeenMs=(time.time() - 8 * 86400) * 1000,
            p2pReachable=True,
        )
        self.assertTrue(all(camera.available for camera in cameras))

    async def test_standalone_battery_window_is_not_widened(self):
        cameras, _ = await setup_camera(
            codec="camera", power="battery", stationSn="T8000P0000000001",
            lastSeenMs=(time.time() - 7 * 3600) * 1000,
        )
        self.assertTrue(all(not camera.available for camera in cameras))
