package com.erickson.run262;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android screen pinning (lock-task mode) for Run Mode's lock overlay. The
 * in-app overlay can only swallow touches inside the webview — the OS home /
 * recents gestures stay live, which is how a bouncing pocket reached the
 * dialer mid-run (Jul 19). Pinning is Android's sanctioned way to block those
 * gestures until the user deliberately unpins (swipe-up-and-hold, plus the
 * device PIN if "ask for PIN before unpinning" is enabled).
 *
 * Without device-owner privileges Android may show a one-time consent dialog,
 * and the user must have App pinning enabled in Settings > Security. All
 * failures are swallowed: worst case is the old behavior (overlay only).
 */
@CapacitorPlugin(name = "ScreenPin")
public class ScreenPinPlugin extends Plugin {

    @PluginMethod
    public void pin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startLockTask();
            } catch (Exception ignored) {
                // pinning unavailable/declined — overlay-only lock still applies
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void unpin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().stopLockTask();
            } catch (Exception ignored) {
                // not pinned — nothing to release
            }
        });
        call.resolve();
    }
}
