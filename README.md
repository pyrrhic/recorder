### Quick Start:

Don't forget to replace 'YOUR_API_TOKEN' with your actual api token.

#### Put this script tag at the end of the header tag in your index.html:
```aiignore
<script src="https://unpkg.com/@affogatosoftware/recorder/dist/browser/recorder.iife.js"></script>
<script>
  const rec = new Recorder(window, 'YOUR_API_TOKEN', { MaskingLevel.InputPasswordOrEmailAndTextArea });
  rec.start();
</script>
```

#### In your js/ts code:
```aiignore
import { Recorder } from '@affogatosoftware/recorder';
...
const rec = new Recorder(window, 'YOUR_API_TOKEN', { MaskingLevel.InputPasswordOrEmailAndTextArea });
rec.start();
```

### Masking Options
The masking level that gets passed in when the Recorder object is created will dictate what elements will turn their text into an asterisks (*).
This can be passed in using the MaskingLevel enum (ex. MaskingLevel.InputAndTextArea) or as a string ("InputAndTextArea").

* none: Nothing will get masked. Everything will be recorded and stored. **Make sure you have the user's permission to store potential PII.**
* all: All text will be masked.
* input-and-text-area: All input and text area tags will have their text masked.
* input-password-or-email-and-text-area: All input tags of type password and email will have their text masked. All text area tags will ahve their text masked.

If you want a safe default that won't require you to make a cookie banner, choose All. 