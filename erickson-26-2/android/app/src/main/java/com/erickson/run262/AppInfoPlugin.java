package com.erickson.run262;

import android.content.pm.PackageInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports the installed APK's versionName to the web layer, which powers the
 * "Update available" card on Today (lib/appUpdate.ts compares it against the
 * latest GitHub release). The web ships ahead of this plugin — on APKs that
 * predate it, get() simply isn't there and the web falls back to inferring
 * the version by probing known plugins.
 */
@CapacitorPlugin(name = "AppInfo")
public class AppInfoPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        try {
            PackageInfo pi = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("version", pi.versionName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("version unavailable");
        }
    }
}
