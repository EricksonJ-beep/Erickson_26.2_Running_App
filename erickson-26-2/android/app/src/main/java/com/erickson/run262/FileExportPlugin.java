package com.erickson.run262;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Backup export for Progress → Export data. The browser path (a Blob URL on an
 * <a download>) is a no-op inside the Android WebView — it has no download
 * handler, and blob: URLs can't be handed to one anyway — so the native app's
 * Export button silently did nothing. This writes the JSON straight to the
 * phone's Downloads folder (MediaStore, no storage permission on Android 10+)
 * or, on older Android or failure, opens the share sheet (Drive, Gmail, Files).
 */
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename", "backup.json");
        String data = call.getString("data");
        if (data == null) {
            call.reject("no data");
            return;
        }
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                ContentResolver cr = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download");
                Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("insert failed");
                try (OutputStream out = cr.openOutputStream(uri)) {
                    if (out == null) throw new Exception("open failed");
                    out.write(bytes);
                }
                JSObject ret = new JSObject();
                ret.put("method", "downloads");
                call.resolve(ret);
                return;
            } catch (Exception ignored) {
                // fall through to the share sheet
            }
        }
        share(call, filename, bytes);
    }

    private void share(PluginCall call, String filename, byte[] bytes) {
        try {
            File dir = new File(getContext().getCacheDir(), "exports");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("mkdir failed");
            File f = new File(dir, filename);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                f
            );
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/json");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, filename);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Save backup");
            getActivity().runOnUiThread(() -> getActivity().startActivity(chooser));
            JSObject ret = new JSObject();
            ret.put("method", "share");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("export failed: " + e.getMessage());
        }
    }
}
