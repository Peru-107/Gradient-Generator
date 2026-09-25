package com.gradii.wallpaperstudio;

import android.app.WallpaperManager;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens Android's own "crop and set wallpaper" system UI directly on a
 * generated image, instead of leaving the user to save it and go find it
 * in a gallery app afterward.
 */
@CapacitorPlugin(name = "WallpaperSetter")
public class WallpaperSetterPlugin extends Plugin {
    @PluginMethod
    public void setWallpaper(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("Missing uri");
            return;
        }
        try {
            Uri uri = Uri.parse(uriString);
            WallpaperManager wallpaperManager = WallpaperManager.getInstance(getContext());
            Intent intent = wallpaperManager.getCropAndSetWallpaperIntent(uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open wallpaper chooser: " + e.getMessage(), e);
        }
    }
}
