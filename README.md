### Quick Start:

Put this script tag at the end of the header tag in your index.html:
```aiignore
<script src="https://unpkg.com/@affogatosoftware/recorder/dist/browser/recorder.iife.js"></script>
<script>
  (new window.scryspell.Recorder(window, 'YOUR_API_TOKEN', { maskingLevel: "all" })).start();
</script>
```
**Don't forget to replace 'YOUR_API_TOKEN' with your actual api token.**

### Masking Options
The masking level that gets passed in when the Recorder object is created will dictate what elements will turn their text into an asterisks (*).
This can be passed in using the MaskingLevel enum (ex. MaskingLevel.InputAndTextArea) or as a string ("InputAndTextArea").

* none: Nothing will get masked. Everything will be recorded and stored. **Make sure you have the user's permission to store potential PII.**
* all: All text will be masked. You won't need to show your users a cookie banner.
* input-and-text-area: All input and text area tags will have their text masked. If sensitive information is displayed as plain text outside of those 2 html tags, you'll need a cookie banner.
* input-password-or-email-and-text-area: All input tags of type password and email will have their text masked. All text area tags will ahve their text masked. If sensitive information is displayed as plain text outside of those 2 html tags, you'll need a cookie banner.

### Masking specific html elements

To mask all text in specific html elements (and their children) add the css class **scry-block**.