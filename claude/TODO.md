# Some adjustments are needed to the network recording feature.
1. when capturing a request body, there should be a setting that lets users pass in a masking function. if they don't pass one in, the default is to leave the body alone.
2. when capturing request headers, there should be a setting that lets users add headers that should not be recorded.
3. recorderSettings.maskingLevel should not be used in the network recorder.