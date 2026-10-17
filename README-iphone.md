# Call Copilot for iPhone

A web app you add to your Home Screen. It works like the Mac app, but **iPhone can't record phone/FaceTime/Zoom audio**, so it listens with the microphone: put the call on **speakerphone** (or have the call on another device near the phone). Keep the app open with the screen on while listening. Tap **🙋 I'm talking** while you speak so your own words aren't treated as questions; tap again when they talk.

Your OpenAI key and history are stored only on your iPhone (in this web app's storage) and are sent only to OpenAI.
Note: if you delete the Home Screen icon or clear Safari data, the key and history are erased.

## 1. Put it online (free, one time)
iPhone needs the app to be on a secure (https) web address. Easiest:

**Netlify Drop (no coding)**
1. On a computer, go to https://app.netlify.com/drop and create a free account (sign up with email or Google).
2. Unzip **CallCopilot-iphone-site.zip** — you get a folder named `iphone-site`.
3. Drag that **folder** onto the Netlify Drop page. After a few seconds you get an address like `https://something-random.netlify.app`.
   (Without an account Netlify only keeps it for about an hour, so do sign up.)

**Or GitHub Pages**: create a free GitHub account › new public repository › "uploading an existing file" › drag in the files from inside `iphone-site` › Commit › Settings › Pages › Branch: main › Save. Address: `https://YOURNAME.github.io/REPO/`.

The address is hard to guess, but anyone who has it can open the app — they still won't have your key or data (those live only on your phone).

## 2. Add to Home Screen
1. Open the address in **Safari** on your iPhone.
2. Tap the **Share** button (square with arrow) › **Add to Home Screen** › **Add**.
3. Open **Copilot** from your Home Screen.

## 3. First use
1. **Settings**: paste your OpenAI key (from https://platform.openai.com/api-keys) › **Save key** › **Test**.
2. **Profile**: paste resume and notes › **Save profile**.
3. **Live** › **● Start listening** › allow the microphone.
4. Answers appear in the card; use **Shorter / Deeper / Example / Simpler**, or type in **Ask anything…**. **Stop** then **Wrap up** for summary, action items and a follow-up email. Old calls are in **History**.

If the mic is blocked: iPhone Settings › Apps › Safari › Microphone › Allow (or Ask).
