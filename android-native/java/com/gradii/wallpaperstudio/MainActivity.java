package com.gradii.wallpaperstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WallpaperSetterPlugin.class);
        registerPlugin(DeviceSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
