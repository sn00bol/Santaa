const { mode } = require('../../commands/Utils/config');

// Weather reset time based on mode
const WEATHER_RESET_MS = mode === 'test' ? 3 * 60 * 1000 : 6 * 60 * 60 * 1000; // 3 mins (test) or 6 hours (prod)

const WEATHER_TYPES = ['sunny', 'cloudy', 'rainy', 'cold', 'clear'];
const WEATHER_EMOJIS = {
    sunny: '☀️',
    cloudy: '⛅',
    rainy: '🌧️',
    cold: '🌨️',
    clear: '✨'
};
const WEATHER_LABELS = {
    sunny: 'Sunny',
    cloudy: 'Cloudy',
    rainy: 'Rainy',
    cold: 'Freezing Cold',
    clear: 'Clear'
};

const DAYNIGHT_EMOJIS = {
    day: '☀️',
    night: '🌙'
};

const weatherState = new Map(); // mapId -> { type, expiresAt, dayNight }

class WeatherManager {
    getCurrentDayNight() {
        const now = new Date();
        const utc7Hour = (now.getUTCHours() + 7) % 24;
        return (utc7Hour >= 6 && utc7Hour < 18) ? 'day' : 'night';
    }

    rollWeather(locationId) {
        const type = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
        const dayNight = this.getCurrentDayNight();
        const expiresAt = Date.now() + WEATHER_RESET_MS;
        
        const state = { type, dayNight, expiresAt };
        weatherState.set(locationId, state);
        return state;
    }

    getWeather(locationId) {
        if (!locationId) return null;
        
        let state = weatherState.get(locationId);
        const currentDayNight = this.getCurrentDayNight();
        
        if (!state || Date.now() >= state.expiresAt) {
            state = this.rollWeather(locationId);
        } else if (state.dayNight !== currentDayNight) {
            // Update day/night instantly if time shifted without resetting weather type
            state.dayNight = currentDayNight;
            weatherState.set(locationId, state);
        }
        
        return state;
    }

    getWeatherInfo(locationId) {
        const state = this.getWeather(locationId);
        if (!state) return null;
        
        const timeRemaining = Math.max(0, state.expiresAt - Date.now());
        const minutes = Math.floor(timeRemaining / 60000);
        const seconds = Math.floor((timeRemaining % 60000) / 1000);
        const timeStr = minutes > 60 
            ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` 
            : `${minutes}m ${seconds}s`;
            
        return {
            type: state.type,
            dayNight: state.dayNight,
            emoji: state.type === 'clear' ? DAYNIGHT_EMOJIS[state.dayNight] : WEATHER_EMOJIS[state.type],
            label: WEATHER_LABELS[state.type],
            timeRemainingStr: timeStr,
            isNight: state.dayNight === 'night'
        };
    }
}

module.exports = new WeatherManager();
