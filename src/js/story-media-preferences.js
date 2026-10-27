const STORY_MEDIA_MODE_STORAGE_KEY = 'igDownloaderStoryMediaMode';

const storyMediaPreferences = Object.freeze(
    (() => {
        function loadMode() {
            try {
                const saved = localStorage.getItem(STORY_MEDIA_MODE_STORAGE_KEY);
                return Object.values(IGDownloaderMedia.MODES).includes(saved) ? saved : IGDownloaderMedia.MODES.IMAGE;
            } catch {
                return IGDownloaderMedia.MODES.IMAGE;
            }
        }

        let mode = loadMode();
        return {
            get mode() {
                return mode;
            },
            setMode(value) {
                if (!Object.values(IGDownloaderMedia.MODES).includes(value)) return;
                mode = value;
                try {
                    localStorage.setItem(STORY_MEDIA_MODE_STORAGE_KEY, mode);
                } catch (error) {
                    console.warn('Unable to save story media preference', error);
                }
            },
        };
    })(),
);
