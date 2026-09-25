const {
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require("discord.js");
const { getPaginationRow, createFastNavigateModal } = require("../Utils/NavigateManager");
const { execSync } = require("child_process");
const { version: PKG_VERSION } = require("../../../package.json");

const COMMIT_COUNT = (() => {
    try { return execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(); }
    catch { return "0"; }
})();
const BOT_VERSION = `v${PKG_VERSION}.${COMMIT_COUNT}`;

// Temporarily, will make it into a file soon
const SETTINGS = [
    {
        id: "passive",
        label: "Passive Mode",
        description: "Protects you from being stolen from, but in return you cannot steal from others or perform any crimes.",
    },
    {
        id: "dm_notify",
        label: "DM Notifications",
        description: "Receive direct messages for important events like heists, trades, and level-ups.",
    },
    {
        id: "show_balance",
        label: "Public Balance",
        description: "Allow other users to view your wallet and bank balance via the profile command.",
    },
    {
        id: "trade_lock",
        label: "Trade Lock",
        description: "Prevents anyone from sending you trade requests. Useful if you want to avoid unsolicited trades.",
    },
    {
        id: "heist_invite",
        label: "Heist Invites",
        description: "Allow other users to invite you to heist parties. Disable to block all heist invitations.",
    },
    {
        id: "compact_profile",
        label: "Compact Profile",
        description: "Display a condensed version of your profile to reduce message length.",
    },
];

const ITEMS_PER_PAGE = 5;

const getUserSettings = async (db, userId) => {
    try {
        return await db.getUserSettings(userId);
    } catch {
        return {};
    }
};

const buildSettingsPage = (allSettings, page, userSettings) => {
    const totalPages = Math.max(1, Math.ceil(allSettings.length / ITEMS_PER_PAGE));
    const start = page * ITEMS_PER_PAGE;
    const paged = allSettings.slice(start, start + ITEMS_PER_PAGE);

    const container = new ContainerBuilder();

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("## \u2699\uFE0F  Settings")
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${BOT_VERSION}`)
    );
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    if (paged.length === 0) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent("*No settings available.*")
        );
    } else {
        paged.forEach((setting) => {
            const isEnabled = !!(userSettings[setting.id]);
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**${setting.label}**\n-# ${setting.description}`
                        )
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId(`toggle_${setting.id}`)
                            .setLabel(isEnabled ? "ON" : "OFF")
                            .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
                    )
            );
        });
    }
    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Page ${page + 1} of ${totalPages}`)
    );
    if (totalPages > 1) {
        container.addActionRowComponents(
            getPaginationRow(page, totalPages, { includeFastNavigate: true })
        );
    }

    return { container, totalPages };
};

module.exports = {
    name: "settings",
    aliases: ["setting", "config"],
    description: "View and manage your personal bot settings",
    category: "gnr",
    usage: "Zsettings",

    async execute(message) {
        let currentPage = 0;
        let userSettings = await getUserSettings(message.client.db, message.author.id);

        const { container: initContainer } = buildSettingsPage(
            SETTINGS, currentPage, userSettings
        );

        const response = await message.channel.send({
            components: [initContainer],
            flags: MessageFlags.IsComponentsV2,
        });

        const collector = response.createMessageComponentCollector();

        const refresh = (i) => {
            const { container } = buildSettingsPage(
                SETTINGS, currentPage, userSettings
            );
            return i.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
        };

        collector.on("collect", async (i) => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: "These are not your settings!", ephemeral: true });
            }

            if (i.isButton() && i.customId === "fast_navigate") {
                const totalPages = Math.max(1, Math.ceil(SETTINGS.length / ITEMS_PER_PAGE));
                const modal = createFastNavigateModal(totalPages, `fast_navigate_modal_${i.id}`);
                await i.showModal(modal);

                try {
                    const submitted = await i.awaitModalSubmit({
                        filter: (modalInt) => modalInt.customId === `fast_navigate_modal_${i.id}` && modalInt.user.id === message.author.id,
                        time: 60_000,
                    });

                    const rawInput = submitted.fields.getTextInputValue("page_input")?.trim();
                    const targetPageNum = parseInt(rawInput, 10);

                    if (isNaN(targetPageNum) || targetPageNum < 1 || targetPageNum > totalPages) {
                        return submitted.reply({
                            content: `Invalid page! Please enter a number between 1 and ${totalPages}.`,
                            ephemeral: true,
                        });
                    }

                    currentPage = targetPageNum - 1;
                    const { container } = buildSettingsPage(SETTINGS, currentPage, userSettings);

                    return submitted.update({
                        components: [container],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } catch {
                    // Modal submission timed out or closed
                    return;
                }
            }

            if (i.isButton() && ["prev", "next", "first", "last"].includes(i.customId)) {
                const totalPages = Math.max(1, Math.ceil(SETTINGS.length / ITEMS_PER_PAGE));
                switch (i.customId) {
                    case "first": currentPage = 0; break;
                    case "prev": currentPage = Math.max(0, currentPage - 1); break;
                    case "next": currentPage = Math.min(totalPages - 1, currentPage + 1); break;
                    case "last": currentPage = totalPages - 1; break;
                }
                return refresh(i);
            }

            if (i.isButton() && i.customId.startsWith("toggle_")) {
                const settingId = i.customId.slice("toggle_".length);
                if (!SETTINGS.find((s) => s.id === settingId)) return i.deferUpdate();

                const newValue = !(userSettings[settingId]);
                userSettings = { ...userSettings, [settingId]: newValue };

                try {
                    await message.client.db.setUserSetting(message.author.id, settingId, newValue);
                } catch {
                    // DB unavailable — in-memory state kept for session
                }

                return refresh(i);
            }
        });
    },
};
