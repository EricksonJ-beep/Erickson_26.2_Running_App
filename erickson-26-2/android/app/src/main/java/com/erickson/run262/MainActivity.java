package com.erickson.run262;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must register before the bridge boots.
        registerPlugin(AudioFocusPlugin.class);
        registerPlugin(ScreenPinPlugin.class);
        registerPlugin(AppInfoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
