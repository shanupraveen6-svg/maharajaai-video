'use client';

import { useEffect, useState } from 'react';

/**
 * English and Tamil for the customer's phone. The choice is remembered on that phone; a phone set to
 * Tamil starts in Tamil. Product names and categories stay as the store wrote them.
 * Tamil wording should be checked by a native speaker before each release.
 */
export type PhoneLanguage = 'en' | 'ta';

const STORAGE_KEY = 'tryfocus:phone-language';

const STRINGS = {
  headerTag: { en: 'Try-On, private to you', ta: 'உங்கள் போனில் தனிப்பட்ட ட்ரை-ஆன்' },
  help: { en: 'Help', ta: 'உதவி' },
  back: { en: 'Back', ta: 'பின்செல்' },
  whatToTry: { en: 'What would you like to try on?', ta: 'எதை அணிந்து பார்க்க விரும்புகிறீர்கள்?' },
  storeCollection: { en: 'Store collection', ta: 'கடையின் கலெக்ஷன்' },
  storeCollectionText: { en: 'Pieces from this store', ta: 'இந்தக் கடையின் உடைகள்' },
  myOwnOutfit: { en: 'My own outfit', ta: 'என் சொந்த உடை' },
  myOwnOutfitText: { en: 'Use a garment you already have', ta: 'உங்களிடம் உள்ள உடையைப் பயன்படுத்துங்கள்' },
  photoTitle: { en: 'Your photo', ta: 'உங்கள் புகைப்படம்' },
  photoSubtitle: { en: 'Full length, standing straight, in good light.', ta: 'முழு உடல், நேராக நின்று, நல்ல வெளிச்சத்தில்.' },
  whoFor: { en: 'Who is it for?', ta: 'யாருக்காக?' },
  women: { en: 'Women', ta: 'பெண்கள்' },
  men: { en: 'Men', ta: 'ஆண்கள்' },
  boys: { en: 'Boys', ta: 'சிறுவர்கள்' },
  girls: { en: 'Girls', ta: 'சிறுமிகள்' },
  guardianAgree: { en: 'I am the parent or guardian and approve using this child’s photo.', ta: 'நான் பெற்றோர் அல்லது பாதுகாவலர். இந்தக் குழந்தையின் புகைப்படத்தைப் பயன்படுத்த அனுமதிக்கிறேன்.' },
  takePhoto: { en: 'Take or choose a photo', ta: 'புகைப்படம் எடுங்கள் அல்லது தேர்வு செய்யுங்கள்' },
  changePhoto: { en: 'Change photo', ta: 'புகைப்படத்தை மாற்று' },
  addPhoto: { en: 'Add photo', ta: 'புகைப்படம் சேர்' },
  needPhoto: { en: 'Add your photo to continue.', ta: 'தொடர உங்கள் புகைப்படத்தைச் சேருங்கள்' },
  needGuardian: { en: 'A parent or guardian must agree first', ta: 'முதலில் பெற்றோர் அல்லது பாதுகாவலர் அனுமதி தேவை' },
  addMyOutfit: { en: 'Add my outfit', ta: 'என் உடையைச் சேர்' },
  pickAnOutfit: { en: 'Pick an outfit', ta: 'உடையைத் தேர்ந்தெடு' },
  you: { en: 'You', ta: 'நீங்கள்' },
  newLook: { en: 'New look', ta: 'புதிய தோற்றம்' },
  savePhoto: { en: 'Save photo', ta: 'புகைப்படத்தைச் சேமி' },
  tryAnother: { en: 'Try another', ta: 'வேறொன்றை முயற்சி செய்' },
  yourOutfit: { en: 'Your outfit', ta: 'உங்கள் உடை' },
  noStyles: { en: 'No pieces in this category yet.', ta: 'இந்தப் பிரிவில் இன்னும் உடைகள் இல்லை.' },
  layFlat: { en: 'Photograph one garment at a time.', ta: 'ஒரு நேரத்தில் ஒரு உடையை மட்டும் படம் எடுங்கள்.' },
  outfitGuide1: { en: 'One garment at a time, not a full set.', ta: 'ஒரு நேரத்தில் ஒரு உடை மட்டும், முழு செட் வேண்டாம்.' },
  outfitGuide2: { en: 'Hold it up, lay it flat or hang it, the whole piece in the frame, in good light.', ta: 'கையில் பிடித்து, விரித்து அல்லது தொங்கவிட்டு, முழு உடையும் தெரியும்படி, நல்ல வெளிச்சத்தில் எடுங்கள்.' },
  changeOutfitPhoto: { en: 'Change outfit photo', ta: 'உடைப் புகைப்படத்தை மாற்று' },
  addOutfitPhoto: { en: 'Add outfit photo', ta: 'உடைப் புகைப்படம் சேர்' },
  creatingNote: { en: 'Creating your look. This takes about 20 seconds.', ta: 'உங்கள் தோற்றம் தயாராகிறது. சுமார் 20 வினாடிகள் ஆகும்.' },
  needOutfitPhoto: { en: 'Add a photo of your garment to continue.', ta: 'தொடர உங்கள் உடையின் புகைப்படத்தைச் சேருங்கள்' },
  creating: { en: 'Creating your look…', ta: 'உங்கள் தோற்றம் தயாராகிறது…' },
  createMyLook: { en: 'Create my look', ta: 'என் தோற்றத்தை உருவாக்கு' },
  saveFailed: { en: 'We couldn’t save your look. Please try again.', ta: 'உங்கள் தோற்றத்தைச் சேமிக்க முடியவில்லை. மீண்டும் முயற்சி செய்யுங்கள்.' },
  photoUnreadable: { en: 'We couldn’t read this photo. Please choose another.', ta: 'இந்தப் புகைப்படத்தைப் படிக்க முடியவில்லை. வேறொன்றைத் தேர்வு செய்யுங்கள்.' },
  guardianFirst: { en: 'A parent or guardian must approve the child’s photo first.', ta: 'முதலில் பெற்றோர் அல்லது பாதுகாவலர் குழந்தையின் புகைப்படத்தை அனுமதிக்க வேண்டும்.' },
  chooseFromCatalogue: { en: 'Choose a garment from this store’s catalogue.', ta: 'இந்தக் கடையின் கலெக்ஷனில் இருந்து ஒரு உடையைத் தேர்வு செய்யுங்கள்.' },
  photoAndOutfitFirst: { en: 'Add your photo and choose an outfit first.', ta: 'முதலில் உங்கள் புகைப்படத்தைச் சேர்த்து ஒரு உடையைத் தேர்வு செய்யுங்கள்.' },
  generationFailed: { en: 'We couldn’t create your look. Please try again.', ta: 'உங்கள் தோற்றத்தை உருவாக்க முடியவில்லை. மீண்டும் முயற்சி செய்யுங்கள்.' },
  generationOffline: { en: 'Connection lost. Check your internet and try again.', ta: 'இணைப்பு துண்டிக்கப்பட்டது. இணையத்தைச் சரிபார்த்து மீண்டும் முயற்சி செய்யுங்கள்.' },
  consentTryOn: {
    en: 'By taking or adding a photo you agree that it is sent to our AI partners to create your look. It is not kept after your look is made. A parent or guardian must agree for a child.',
    ta: 'புகைப்படம் எடுப்பதன் மூலம், உங்கள் தோற்றத்தை உருவாக்க அது எங்கள் AI கூட்டாளர்களுக்கு அனுப்பப்படுவதை ஏற்கிறீர்கள். தோற்றம் உருவான பிறகு அது வைத்திருக்கப்படாது. குழந்தைக்கு பெற்றோர் அல்லது பாதுகாவலர் அனுமதி தேவை.',
  },
  privacy: { en: 'Privacy', ta: 'தனியுரிமை' },
  // Wall QR Try-On steps
  exitTitle: { en: 'Leave Try-On?', ta: 'ட்ரை-ஆனை விட்டு வெளியேறவா?' },
  exitVideoTitle: { en: 'Leave AI Video?', ta: 'AI வீடியோவை விட்டு வெளியேறவா?' },
  exitText: { en: 'Your photo and look on this page will be lost.', ta: 'இந்தப் பக்கத்தில் உள்ள உங்கள் புகைப்படமும் தோற்றமும் இழக்கப்படும்.' },
  exitBtn: { en: 'Leave', ta: 'வெளியேறு' },
  guideLine1: { en: 'Take a full-length photo, not a selfie.', ta: 'செல்ஃபி வேண்டாம், முழு உடல் தெரியும்படி படம் எடுங்கள்.' },
  guideLine2: { en: 'Stand in good light and face the camera straight.', ta: 'நல்ல வெளிச்சத்தில் நின்று, கேமராவை நேராகப் பாருங்கள்.' },
  billTitle: { en: 'Photo of your bill', ta: 'உங்கள் பில்லின் புகைப்படம்' },
  billSubtitle: { en: 'Try-On is for purchases from', ta: 'ட்ரை-ஆன் இந்தத் தொகைக்கு மேல் வாங்கியவர்களுக்கு:' },
  billChecking: { en: 'Checking your bill…', ta: 'உங்கள் பில் சரிபார்க்கப்படுகிறது…' },
  billUnreadable: { en: 'The bill could not be read. Take the photo again with the whole bill flat and in good light.', ta: 'பில்லைப் படிக்க முடியவில்லை. முழு பில்லும் தெரியும்படி நல்ல வெளிச்சத்தில் மீண்டும் படம் எடுங்கள்.' },
  whatType: { en: 'What are you trying?', ta: 'எந்த வகை உடை?' },
  otherType: { en: 'Other', ta: 'மற்றவை' },
  camera: { en: 'Camera', ta: 'கேமரா' },
  upload: { en: 'Upload', ta: 'பதிவேற்று' },
  continueBtn: { en: 'Continue', ta: 'தொடருங்கள்' },
  yourLook: { en: 'Your look', ta: 'உங்கள் தோற்றம்' },
  moreOptions: { en: 'More options', ta: 'மேலும் விருப்பங்கள்' },
  tryOnceMore: { en: 'Try again', ta: 'மீண்டும் முயற்சி' },
  followInstagram: { en: 'Follow us on Instagram', ta: 'இன்ஸ்டாகிராமில் எங்களைப் பின்தொடருங்கள்' },
  shareWhatsApp: { en: 'Share on WhatsApp', ta: 'வாட்ஸ்அப்பில் பகிருங்கள்' },
  shareText: { en: 'I tried this look at', ta: 'இந்தத் தோற்றத்தை நான் முயற்சித்த இடம்:' },
  shareInvite: { en: 'Try yours free:', ta: 'நீங்களும் இலவசமாக முயற்சிக்க:' },
  savedTitle: { en: 'Your look is saved on your phone', ta: 'உங்கள் தோற்றம் உங்கள் போனில் சேமிக்கப்பட்டது' },
  savedText: { en: 'It’s in your gallery. Follow us for new arrivals, or share it with friends.', ta: 'உங்கள் கேலரியில் உள்ளது. புதிய வரவுகளுக்கு எங்களைப் பின்தொடருங்கள், அல்லது நண்பர்களுடன் பகிருங்கள்.' },
  doneTitle: { en: 'You’ve used your free look on this phone', ta: 'இந்த போனில் உங்கள் இலவச தோற்றத்தைப் பயன்படுத்திவிட்டீர்கள்' },
  doneText: { en: 'Follow us for new arrivals, or invite a friend to try theirs.', ta: 'புதிய வரவுகளுக்கு எங்களைப் பின்தொடருங்கள், அல்லது நண்பரையும் முயற்சிக்க அழையுங்கள்.' },
  // Store collection outfit picker (after "new collection" on the gift QR, or from the TV)
  videoWhatType: { en: 'What would you like to wear?', ta: 'எந்த வகை உடை அணிய விரும்புகிறீர்கள்?' },
  giftPhotoText: { en: 'Your festive AI Video is made from this photo.', ta: 'இந்தப் புகைப்படத்திலிருந்து உங்கள் பண்டிகை AI வீடியோ உருவாகும்.' },
  pickLook: { en: 'Pick a look', ta: 'ஒரு தோற்றத்தைத் தேர்ந்தெடுங்கள்' },
  pickLookText: { en: 'The setting for your video. Your piece stays exactly as it is.', ta: 'உங்கள் வீடியோவின் பின்னணி. உங்கள் உடை அப்படியே இருக்கும்.' },
  makePortrait: { en: 'Make my portrait', ta: 'என் புகைப்படத்தை உருவாக்கு' },
  creatingPortrait: { en: 'Making your portrait… about 30 seconds.', ta: 'உங்கள் புகைப்படம் உருவாகிறது… சுமார் 30 வினாடிகள்.' },
  yourPortrait: { en: 'Your portrait', ta: 'உங்கள் புகைப்படம்' },
  portraitText: { en: 'This picture becomes your six-second video.', ta: 'இந்தப் படம் உங்கள் ஆறு வினாடி வீடியோவாக மாறும்.' },
  makeVideo: { en: 'Make my video', ta: 'என் வீடியோவை உருவாக்கு' },
  creatingVideo: { en: 'Making your video… a few minutes. Keep this page open; you can come back to it.', ta: 'உங்கள் வீடியோ உருவாகிறது… சில நிமிடங்கள். இந்தப் பக்கத்தைத் திறந்தே வைத்திருங்கள்.' },
  retryPortrait: { en: 'Retry portrait', ta: 'மீண்டும் உருவாக்கு' },
  linkInvalid: { en: 'This link is not valid. Please ask the store for a new one.', ta: 'இந்த இணைப்பு செல்லாது. கடையில் புதிய இணைப்பைக் கேளுங்கள்.' },
  chooseOutfit: { en: 'Choose your outfit', ta: 'உங்கள் உடையைத் தேர்ந்தெடுங்கள்' },
  chooseOutfitText: { en: 'Pick an outfit, then add your photo. Your festive video is made in this outfit.', ta: 'ஒரு உடையைத் தேர்ந்தெடுத்து, உங்கள் புகைப்படத்தைச் சேருங்கள். இந்த உடையில் உங்கள் பண்டிகை வீடியோ உருவாகும்.' },
  moreOutfits: { en: 'More outfits', ta: 'மேலும் உடைகள்' },
  loadingOutfits: { en: 'Loading outfits…', ta: 'உடைகள் ஏற்றப்படுகின்றன…' },
  continueWithOutfit: { en: 'Continue with this outfit', ta: 'இந்த உடையுடன் தொடருங்கள்' },
  saving: { en: 'Saving…', ta: 'சேமிக்கிறது…' },
  // Live Mirror video page
  mirrorTitle: { en: 'Your Live Mirror video', ta: 'உங்கள் லைவ் மிரர் வீடியோ' },
  downloadVideo: { en: 'Download video', ta: 'வீடியோவைப் பதிவிறக்கு' },
  compareLooks: { en: 'Compare your looks', ta: 'உங்கள் தோற்றங்களை ஒப்பிடுங்கள்' },
  compareLooksText: { en: 'Every outfit you tried, side by side. Tap one to save it.', ta: 'நீங்கள் அணிந்த எல்லா உடைகளும் அருகருகே. சேமிக்க ஒன்றைத் தொடுங்கள்.' },
  loadingVideo: { en: 'Loading your video…', ta: 'உங்கள் வீடியோ ஏற்றப்படுகிறது…' },
  videoUnavailable: { en: 'This video is no longer available.', ta: 'இந்த வீடியோ இப்போது கிடைக்கவில்லை.' },
  linkWorksUntil: { en: 'This private link works until', ta: 'இந்தத் தனிப்பட்ட இணைப்பு செயல்படும் நேரம்:' },
  // The WhatsApp number asked before any download
  leadTitle: { en: 'Save to your phone', ta: 'உங்கள் போனில் சேமிக்க' },
  leadText: { en: 'Enter your WhatsApp number to download your look.', ta: 'உங்கள் தோற்றத்தைப் பதிவிறக்க உங்கள் வாட்ஸ்அப் எண்ணை உள்ளிடுங்கள்.' },
  leadNumber: { en: 'WhatsApp number', ta: 'வாட்ஸ்அப் எண்' },
  leadOffers: { en: 'Send me this store’s offers on WhatsApp', ta: 'இந்தக் கடையின் சலுகைகளை வாட்ஸ்அப்பில் எனக்கு அனுப்பவும்' },
  leadSubmit: { en: 'Download', ta: 'பதிவிறக்கு' },
  leadAlreadyRegistered: { en: 'This number is already registered. Your download is starting.', ta: 'இந்த எண் ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது. பதிவிறக்கம் தொடங்குகிறது.' },
  leadInvalid: { en: 'Enter a 10-digit WhatsApp number.', ta: '10 இலக்க வாட்ஸ்அப் எண்ணை உள்ளிடுங்கள்.' },
  leadPrivacy: { en: 'We use your number only as you choose here.', ta: 'நீங்கள் இங்கே தேர்வு செய்தபடி மட்டுமே கடை உங்கள் எண்ணைப் பயன்படுத்தும்.' },
  cancel: { en: 'Cancel', ta: 'ரத்து' },
} as const;

export type PhoneStringKey = keyof typeof STRINGS;

export function usePhoneLanguage() {
  const [language, setLanguageState] = useState<PhoneLanguage>('en');

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    const preferred = saved === 'ta' || saved === 'en' ? saved : navigator.language?.toLowerCase().startsWith('ta') ? 'ta' : 'en';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the phone's stored choice is only readable after mount
    setLanguageState(preferred);
  }, []);

  function setLanguage(next: PhoneLanguage) {
    setLanguageState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  }

  const t = (key: PhoneStringKey) => STRINGS[key][language];
  return { language, setLanguage, t };
}
