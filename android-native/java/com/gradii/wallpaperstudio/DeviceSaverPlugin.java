package com.gradii.wallpaperstudio;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Saves an exported file straight into the phone's shared storage, like a
 * browser download would — images to Pictures/Gradii, videos to
 * Movies/Gradii, everything else (CSS, palettes, HTML) to Download/Gradii.
 *
 * Android 10+ uses MediaStore, which needs no permission for files the app
 * itself creates. Android 9 and below write to the public folder directly,
 * which needs WRITE_EXTERNAL_STORAGE (declared with maxSdkVersion=28 so it
 * is never requested on newer phones).
 */
@CapacitorPlugin(
    name = "DeviceSaver",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class DeviceSaverPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermsCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storagePermsCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) doSave(call);
        else call.reject("Storage permission denied");
    }

    private void doSave(PluginCall call) {
        String data = call.getString("data");
        String filename = call.getString("filename");
        String mime = call.getString("mimeType", "application/octet-stream");
        if (data == null || filename == null) {
            call.reject("Missing data or filename");
            return;
        }
        String topDir;
        if (mime.startsWith("image/")) topDir = Environment.DIRECTORY_PICTURES;
        else if (mime.startsWith("video/")) topDir = Environment.DIRECTORY_MOVIES;
        else topDir = Environment.DIRECTORY_DOWNLOADS;
        String relative = topDir + "/Gradii";
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                Uri collection;
                if (mime.startsWith("image/")) collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                else if (mime.startsWith("video/")) collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                else collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, relative);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri item = resolver.insert(collection, values);
                if (item == null) throw new Exception("MediaStore insert failed");
                try (OutputStream out = resolver.openOutputStream(item)) {
                    if (out == null) throw new Exception("Could not open output stream");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(item, values, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(topDir), "Gradii");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create " + dir);
                File file = new File(dir, filename);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { mime }, null);
            }
            JSObject ret = new JSObject();
            ret.put("path", relative + "/" + filename);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save: " + e.getMessage(), e);
        }
    }
}
