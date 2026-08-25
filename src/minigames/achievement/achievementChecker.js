const achievementManager = require('./achievementManager');

// Helper to check multiple tiered catches
async function checkCatches(userId, profile, type, counts) {
    const amount = profile.historicalCatches?.[type] || 0;
    for (const count of counts) {
        if (amount >= count) {
            await achievementManager.checkAndGrant(userId, `fish_${type.toLowerCase()}_${count}`);
        }
    }
}

class AchievementChecker {
    async checkFishing(userId, profile, event) {
        if (!profile) return;
        
        const counts = [50, 100, 300, 500, 700, 1000];
        await checkCatches(userId, profile, 'Common', counts);
        await checkCatches(userId, profile, 'Uncommon', counts);
        await checkCatches(userId, profile, 'Rare', counts);
        await checkCatches(userId, profile, 'Epic', counts);
        await checkCatches(userId, profile, 'Legendary', counts);
        await checkCatches(userId, profile, 'Mythic', counts);
        
        if (event) {
            if (event.type === 'catch') {
                if (event.junk) {
                    const junkCount = (profile.historicalCatches?.Junk || 0) + (profile.historicalCatches?.Trash || 0) + 1; // event might not have saved yet or might have
                    if (junkCount >= 100) await achievementManager.checkAndGrant(userId, 'fish_env_protect');
                }
                
                if (event.rod === 'hand' && event.bait === 'finger' && ['Epic', 'Legendary', 'Mythic'].includes(event.fish?.rarity)) {
                    await achievementManager.checkAndGrant(userId, 'fish_hand_lovers');
                }
                
                if (event.rod === 'dynamite') {
                    if ((profile.skill?.dynamiteCatches || 0) >= 100) {
                        await achievementManager.checkAndGrant(userId, 'fish_kaboom_100');
                    }
                }
                
                if (event.fish?.name === 'sn00bol') {
                    await achievementManager.checkAndGrant(userId, 'fish_is_that_you');
                }
                
                if (event.fish?.name === 'Tuna') {
                    await achievementManager.checkAndGrant(userId, 'fish_kimori_fav');
                }
            } else if (event.type === 'giveup') {
                if (event.fish?.rarity === 'Legendary') {
                    await achievementManager.checkAndGrant(userId, 'fish_never_give_up');
                }
            } else if (event.type === 'release') {
                if (event.fish?.rarity === 'Mythic') {
                    await achievementManager.checkAndGrant(userId, 'fish_why_redeem');
                }
            } else if (event.type === 'backrooms') {
                await achievementManager.checkAndGrant(userId, 'fish_backrooms');
            }
        }
        
        if (profile.dailyStreak >= 7) {
            await achievementManager.checkAndGrant(userId, 'fish_no_job');
        }
        
        if (profile.achievements?.includes('fish_whole_world') && profile.achievements?.includes('fish_is_that_you')) {
            await achievementManager.checkAndGrant(userId, 'fish_aguaman');
        }
    }
    
    async checkEconomy(userId, stats, event) {
        if (!stats) return;
        
        if (event === 'beg') {
            if ((stats.begs || 0) >= 300) {
                await achievementManager.checkAndGrant(userId, 'oth_beggar_co');
            }
        }
        
        if (event === 'crime' || event === 'steal') {
            if ((stats.crimes || 0) >= 60 && (stats.steals || 0) >= 60) {
                await achievementManager.checkAndGrant(userId, 'oth_man_steal');
            }
        }
        
        if (event === 'sell') {
            if ((stats.items_sold || 0) >= 100) {
                await achievementManager.checkAndGrant(userId, 'oth_sellers_man');
            }
        }
        
        if (event === 'fail_sell_trade') {
            await achievementManager.checkAndGrant(userId, 'oth_sure_about_that');
        }
        
        if (event === 'sell_sn00bol_fail') {
            await achievementManager.checkAndGrant(userId, 'fish_pls_dont_sell');
        }
        
        if (event === 'parttime') {
            await achievementManager.checkAndGrant(userId, 'oth_moi_moi');
        }
        
        if (event === 'quit_job_immediately') {
            await achievementManager.checkAndGrant(userId, 'oth_fired');
        }
        
        if (event === 'owner_give') {
            await achievementManager.checkAndGrant(userId, 'oth_owner_money');
        }
        
        if (event === 'unknown_category') {
            if ((stats.unknown_category_visits || 0) >= 10) {
                await achievementManager.checkAndGrant(userId, 'oth_construction_done');
            }
        }
    }
    
    async checkPvp(userId, stats) {
        if (!stats) return;
        
        if ((stats.pvp_wins || 0) >= 100) {
            await achievementManager.checkAndGrant(userId, 'oth_pvp_streak');
        }
    }
    
    async checkJob(userId, stats, event = {}) {
        if (!stats) return;
        
        // Check quit job immediately (fired on first session)
        if (event.event === 'quit_job_immediately') {
            await achievementManager.checkAndGrant(userId, 'oth_fired');
        }
        
        // Check parttime achievement
        if (event.event === 'parttime') {
            await achievementManager.checkAndGrant(userId, 'oth_moi_moi');
        }
    }
    
    async checkGeneral(userId, stats, event) {
        if (!stats) return;
        
        if (event === 'equip_iron') {
            let arr = [];
            try { arr = typeof stats.equipped_items === 'string' ? JSON.parse(stats.equipped_items) : (stats.equipped_items || []); } catch (e) {}
            const ironCount = arr.filter(i => typeof i === 'string' && i.includes('iron')).length;
            if (ironCount >= 3) {
                await achievementManager.checkAndGrant(userId, 'oth_iron_man');
            }
        }
        
        if (stats.wanted_level >= 60) {
            if (event === 'play_minigame') {
                await achievementManager.checkAndGrant(userId, 'oth_this_is_fine');
            }
        }
    }
}

module.exports = new AchievementChecker();
