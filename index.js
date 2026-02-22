require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, REST, Routes, ApplicationCommandOptionType, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

// === CONFIGURAÇÃO DO CLIENT ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel]
});

// === VARIÁVEIS GLOBAIS ===
const COOLDOWN = new Set(); // Cooldown de XP
let xpLogConfig = { enabled: false, channelId: null };

// === CONSTANTES DE RECOMPENSA ===
const VOICE_REWARD_INTERVAL = 300000; // 5 minutos em ms
const VOICE_REWARD_PER_INTERVAL = 83.35; // $83.35 por 5 minutos no banco (ajustado proporcionalmente)
const CHAT_REWARD_MIN = 3.33; // Mínimo $3.33 por mensagem no banco (1/3 de 10)
const CHAT_REWARD_MAX = 6.67; // Máximo $6.67 por mensagem no banco (1/3 de 20)
const LEVEL_UP_REWARD_BASE = 166.67; // $166.67 base por subida de nível (1/3 de 500)

// === VARIÁVEIS GLOBAIS ===

const LEVELS = Array.from({ length: 1000 }, (_, i) => (i + 1) * (i + 1) * 100);
let xp = {}, autoMessageConfig = {}, voiceConfig = {}, leaderboardConfig = {}, welcomeConfig = {}, antinukeConfig = {}, logConfig = {}, autopfpConfig = {}, economy = {}, economyLeaderboardConfig = {}, rankingRolesConfig = {}, shopConfig = {}, wordFilterConfig = {}, globalConfig = { embedColor: "#000102" };
let commandsList = []; // Definido globalmente para ser usado no /help
const voiceXP = {}; // { userId: { guildId: { channelId: timestamp } } }

const leaderboardPages = {};
const tempVcOwners = new Map(); // Armazena [channelId, ownerId]
const autopfpIntervals = new Map();
const autoMessageIntervals = new Map(); // Armazena [guildId, intervalId] // Armazena [guildId, intervalId]
const IMAGE_FOLDER = './autopfp_images';



// === FUNÇÕES DE MENSAGENS AUTOMÁTICAS ===
async function sendAutoMessage(guildId) {
    const config = autoMessageConfig[guildId];
    if (!config || !config.enabled) return;

    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(config.channelId);
        if (!channel) return;

        let content = config.message;
        if (config.roleId) {
            content = `<@&${config.roleId}> ${content}`;
        }

        await channel.send(content);
        
        // Atualiza o timestamp do último envio e salva
        config.lastSent = Date.now();
        saveAutoMessageConfig();
    } catch (e) {
        console.error(`Erro ao enviar mensagem automática na guilda ${guildId}:`, e);
    }
}

function startAutoMessages(guildId) {
    const config = autoMessageConfig[guildId];
    if (!config || !config.enabled) return;

    // Limpa intervalo anterior se existir
    if (autoMessageIntervals.has(guildId)) {
        clearInterval(autoMessageIntervals.get(guildId));
    }

    const now = Date.now();
    const lastSent = config.lastSent || 0;
    const timeSinceLastSent = now - lastSent;
    const timeLeft = Math.max(0, config.interval - timeSinceLastSent);

    // Se já passou do tempo ou é a primeira vez, agenda para o tempo restante ou executa logo
    setTimeout(async () => {
        await sendAutoMessage(guildId);
        
        // Após o primeiro envio (ajustado), inicia o intervalo regular
        const intervalId = setInterval(async () => {
            await sendAutoMessage(guildId);
        }, config.interval);
        
        autoMessageIntervals.set(guildId, intervalId);
    }, timeLeft);
}

// === FUNÇÕES DE ARQUIVO ===
function loadConfig(file, configVar, varName) { try { if (fs.existsSync(file)) { Object.assign(configVar, JSON.parse(fs.readFileSync(file, 'utf8'))); console.log(`✅ ${varName} carregado.`); } else { console.log(`⚠️ Arquivo de ${varName} não encontrado.`); } } catch (e) { console.error(`❌ Erro ao carregar ${varName}:`, e); } }
function saveConfig(file, configVar) { try { fs.writeFileSync(file, JSON.stringify(configVar, null, 2)); } catch (e) { console.error(`❌ Erro ao salvar ${file}:`, e); } }
function loadAllConfigs() { loadConfig('./xp.json', xp, 'XP'); loadConfig('./voiceConfig.json', voiceConfig, 'Voz Temporária'); loadConfig('./leaderboard_config.json', leaderboardConfig, 'Leaderboard'); loadConfig('./welcome_config.json', welcomeConfig, 'Boas-vindas'); loadConfig('./logConfig.json', logConfig, 'Logs'); loadConfig('./antinukeConfig.json', antinukeConfig, 'Antinuke'); loadConfig('./autopfpConfig.json', autopfpConfig, 'AutoPFP'); loadConfig('./economy.json', economy, 'Economia'); loadConfig('./economy_leaderboard_config.json', economyLeaderboardConfig, 'Leaderboard Economia'); loadConfig('./ranking_roles_config.json', rankingRolesConfig, 'Cargos de Ranking'); loadConfig('./xpLogConfig.json', xpLogConfig, 'Logs de XP'); loadConfig('./shop_config.json', shopConfig, 'Loja'); loadConfig('./wordFilterConfig.json', wordFilterConfig, 'Filtro de Palavras'); loadConfig('./global_config.json', globalConfig, 'Config Global'); loadConfig('./autoMessageConfig.json', autoMessageConfig, 'Mensagens Automáticas'); }
const saveXP = () => saveConfig('./xp.json', xp);
const saveVoiceConfig = () => saveConfig('./voiceConfig.json', voiceConfig);
const saveLeaderboardConfig = () => saveConfig('./leaderboard_config.json', leaderboardConfig);
const saveWelcomeConfig = () => saveConfig('./welcome_config.json', welcomeConfig);
const saveLogConfig = () => saveConfig('./logConfig.json', logConfig);
const saveAntinukeConfig = () => saveConfig('./antinukeConfig.json', antinukeConfig);
const saveAutoPfpConfig = () => saveConfig('./autopfpConfig.json', autopfpConfig);
	const saveEconomy = () => saveConfig('./economy.json', economy);
	const saveEconomyLeaderboardConfig = () => saveConfig('./economy_leaderboard_config.json', economyLeaderboardConfig);
const saveRankingRolesConfig = () => saveConfig('./ranking_roles_config.json', rankingRolesConfig);
const saveShopConfig = () => saveConfig('./shop_config.json', shopConfig);
const saveXPLogConfig = () => saveConfig('./xpLogConfig.json', xpLogConfig);
const saveWordFilterConfig = () => saveConfig('./wordFilterConfig.json', wordFilterConfig);
const saveGlobalConfig = () => saveConfig('./global_config.json', globalConfig);
const saveAutoMessageConfig = () => saveConfig('./autoMessageConfig.json', autoMessageConfig);

// === FUNÇÕES DE ECONOMIA ===
	function getUser(userId, username) {
	    if (!economy[userId]) {
	        economy[userId] = {
	            username: username,
	            wallet: 0,
	            bank: 0,
	            lastDaily: 0,
	            lastCrash: 0,
	            cooldowns: {} // Para comandos como coinflip, etc.
	        };
	        saveEconomy();
	    }
	    // Atualiza o username em caso de mudança
	    if (economy[userId].username !== username) {
	        economy[userId].username = username;
	        saveEconomy();
	    }
	    return economy[userId];
	}
	
		function updateUser(userId, data) {
		    if (!economy[userId]) return false;
		    Object.assign(economy[userId], data);
		    saveEconomy(); // A chamada a saveEconomy estava faltando aqui.
		    return true;
		}
	
		function formatDollars(amount) {
		    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
		}
		
		// === FUNÇÃO DE XP ===
		function getLevel(xp) {
		    let level = 0;
		    while (level < LEVELS.length && xp >= LEVELS[level]) {
		        level++;
		    }
		    return level;
		}
		
		async function addXP(guild, user, channel) {
		    // Ignora bots e interações sem guild (DMs)
		    if (user.bot || !guild) return; 
		    
		    const guildId = guild.id, userId = user.id;
		    if (!xp[guildId]) xp[guildId] = {};
		
    // Verifica Cooldown de XP
    const cooldownKey = `${guildId}-${userId}`;
    if (COOLDOWN.has(cooldownKey)) return;

    // === Recompensa de Economia por Chat ===
    const chatRewardAmount = Math.floor(Math.random() * (CHAT_REWARD_MAX - CHAT_REWARD_MIN + 1)) + CHAT_REWARD_MIN;
    const userData = getUser(userId, user.tag); // Obtém a referência para os dados do usuário
    userData.bank += chatRewardAmount;
    // Opcional: Notificar o usuário sobre o ganho de dinheiro
    // channel.send(`<a:richxp:1464679900500988150> ${user} ganhou ${formatDollars(chatRewardAmount)} por interagir no chat!`).catch(() => {});

    const currentXP = xp[guildId][userId] || 0;
    const currentLevel = getLevel(currentXP);
    
    // Ganho de XP (entre 15 e 25)
    xp[guildId][userId] = currentXP + Math.floor(Math.random() * 11) + 15; 
    
    // Verifica subida de nível
    const newLevel = getLevel(xp[guildId][userId]);
    if (newLevel > currentLevel) {
        // Recompensa por subida de nível
        const levelUpReward = LEVEL_UP_REWARD_BASE * newLevel;
        userData.bank += levelUpReward; // Usa a mesma referência de userData

        const levelUpEmbed = new EmbedBuilder()
            .setColor(globalConfig.embedColor)
            .setAuthor({ name: "Subida de Nível!", iconURL: "https://i.imgur.com/vM8S9z0.png" })
            .setDescription(`### <a:money:1242505308442595408> Parabéns, ${user}!\nVocê acaba de alcançar o **Nível ${newLevel}**!`)
            .addFields({ name: "<a:richxp:1464679900500988150> Recompensa", value: `\`${formatDollars(levelUpReward)}\` adicionados ao seu banco.` })
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
        channel.send({ content: `${user}`, embeds: [levelUpEmbed] }).catch(() => {});
    }

    // Salva as alterações de economia (chat reward e/ou level up reward)
    updateUser(userId, userData);
		
		    
    // Log de XP e Dinheiro (Chat)
if (xpLogConfig.enabled && xpLogConfig.channelId) {
	        const logChannel = guild.channels.cache.get(xpLogConfig.channelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setColor(globalConfig.embedColor)
                .setAuthor({ name: `Log de Recompensas | ${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setDescription(`### <a:xp:1320858569037582336> Recompensa de Chat
O usuário **${user.username}** interagiu no chat e recebeu suas recompensas!`)
                .addFields(
                    { name: "💬 Canal", value: `<#${channel.id}>`, inline: true },
                    { name: "<a:xp:1320858569037582336> XP Ganho", value: `\`+${xp[guildId][userId] - currentXP} XP\``, inline: true },
                    { name: "<a:richxp:1464679900500988150> Dinheiro", value: `\`${formatDollars(chatRewardAmount)}\``, inline: true },
                    { name: "📊 Nível Atual", value: `\`Lvl ${getLevel(xp[guildId][userId])}\``, inline: true },
                    { name: "📈 XP Total", value: `\`${xp[guildId][userId]}\``, inline: true }
                )
                .setFooter({ text: "Void Economy • Logs", iconURL: client.user.displayAvatarURL() })
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
    
                        saveXP();
		
		    // Aplica Cooldown
		    COOLDOWN.add(cooldownKey);
		    setTimeout(() => COOLDOWN.delete(cooldownKey), 60000); // 60 segundos de cooldown
		}
	

	
	// === FUNÇÕES DE RECOMPENSA DE VOZ ===
function rewardVoiceUsers() {
    const now = Date.now();
    
    // Varre todas as guildas que o bot está
    client.guilds.cache.forEach(guild => {
        const guildId = guild.id;
        
        // Varre todos os canais de voz da guilda
        guild.channels.cache.filter(c => c.type === 2).forEach(channel => {
            const channelId = channel.id;
            
            // Varre todos os membros no canal de voz
            channel.members.forEach(member => {
                if (member.user.bot) return;
                const userId = member.id;
                
                // Inicializa o rastreamento se necessário
                if (!voiceXP[userId]) voiceXP[userId] = {};
                if (!voiceXP[userId][guildId]) voiceXP[userId][guildId] = {};
                if (!voiceXP[userId][guildId][channelId]) {
                    voiceXP[userId][guildId][channelId] = now;
                    return;
                }
                
                const lastRewardTime = voiceXP[userId][guildId][channelId];
                const timeElapsed = now - lastRewardTime;
                
                if (timeElapsed >= VOICE_REWARD_INTERVAL) {
                    const intervals = Math.floor(timeElapsed / VOICE_REWARD_INTERVAL);
                    const rewardAmount = intervals * VOICE_REWARD_PER_INTERVAL;
                    const xpGain = intervals * 50; // Ajustado para 50 XP (10 por minuto * 5 minutos)
                    
                    if (!xp[guildId]) xp[guildId] = {};
                    const currentXP = xp[guildId][userId] || 0;
                    const currentLevel = getLevel(currentXP);
                    xp[guildId][userId] = currentXP + xpGain;
                    saveXP();
                    
                    const userData = getUser(userId, member.user.tag);
                    userData.bank += rewardAmount;
                    
                    const newLevel = getLevel(xp[guildId][userId]);
                    if (newLevel > currentLevel) {
                        const levelUpReward = LEVEL_UP_REWARD_BASE * newLevel;
                        userData.bank += levelUpReward;
                    }
                    
                    updateUser(userId, userData);
                    
                    // Log
                    if (xpLogConfig.enabled && xpLogConfig.channelId) {
                        const logChannel = guild.channels.cache.get(xpLogConfig.channelId);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor(globalConfig.embedColor)
                                .setAuthor({ name: `Log de Recompensas | ${member.user.username}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
                                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                                .setDescription(`### 🎙️ Recompensa de Voz\nO usuário **${member.user.username}** recebeu recompensas por seu tempo em call!`)
                                .addFields(
                                    { name: "🎙️ Canal", value: `\`${channel.name}\``, inline: true },
                                    { name: "⏱️ Tempo", value: `\`${intervals} min\``, inline: true },
                                    { name: "<a:xp:1320858569037582336> XP Ganho", value: `\`+${xpGain} XP\``, inline: true },
                                    { name: "<a:richxp:1464679900500988150> Dinheiro", value: `\`${formatDollars(rewardAmount)}\``, inline: true },
                                    { name: "📊 Nível Atual", value: `\`Lvl ${getLevel(xp[guildId][userId])}\``, inline: true },
                                    { name: "📈 XP Total", value: `\`${xp[guildId][userId]}\``, inline: true }
                                )
                                .setFooter({ text: "Void Economy • Logs", iconURL: client.user.displayAvatarURL() })
                                .setTimestamp();
                            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                        }
                    }
                    
                    voiceXP[userId][guildId][channelId] = now - (timeElapsed % VOICE_REWARD_INTERVAL);
                }
            });
        });
    });
    
    // Limpeza
    for (const userId in voiceXP) {
        for (const guildId in voiceXP[userId]) {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) { delete voiceXP[userId][guildId]; continue; }
            for (const channelId in voiceXP[userId][guildId]) {
                const channel = guild.channels.cache.get(channelId);
                if (!channel || !channel.members.has(userId)) {
                    delete voiceXP[userId][guildId][channelId];
                }
            }
            if (Object.keys(voiceXP[userId][guildId]).length === 0) delete voiceXP[userId][guildId];
        }
        if (Object.keys(voiceXP[userId]).length === 0) delete voiceXP[userId];
    }
}

// === FUNÇÕES PRINCIPAIS ===
	

	
	// === HANDLER DE COMANDO /SETRULESCHANNEL ===
async function handleSetRulesChannel(interaction) {
    // URL da imagem de banner "Rules" (O usuário deve substituir por uma URL válida após fazer o upload)
    const RULES_BANNER_URL = 'https://i.imgur.com/LsI8SSq.gif'; // SUBSTITUÍDO PELO USUÁRIO



    // Conteúdo das Regras
    const rulesContent = [
        {
            name: '<a:checkmark_void88:1320743200591188029> 1. Comportamento Tóxico e Discriminação',
            value: 'É **extremamente proibido** qualquer tipo de agressão verbal, preconceito ou prática de discriminação (homofobia, racismo, xenofobia, assédio, ou qualquer outro comportamento tóxico), ameaças ou ofensas a um indivíduo. O Vazio não tolera o ódio.',
            inline: false,
        },
        {
            name: '<a:checkmark_void88:1320743200591188029> 2. Divulgação e Spam',
            value: 'Divulgação de outros servidores (seja link de convite ou de qualquer outra forma) sem permissão da STAFF é proibida. Evite qualquer tipo de flood/spam que polua o ambiente com mensagens indesejadas. A insistência atrai a punição.',
            inline: false,
        },
        {
            name: '<a:checkmark_void88:1320743200591188029> 3. Comunicação com a Staff',
            value: 'Não chame nenhum membro da Staff no privado para tirar satisfação. Questões relacionadas ao servidor são resolvidas **dentro do servidor**, preferencialmente por meio de um **ticket**.',
            inline: false,
        },
        {
            name: '<a:checkmark_void88:1320743200591188029> 4. Promoção Ilegal e Cheats',
            value: 'Qualquer tipo de promoção de servidores, trocas ou vendas de produtos, vídeos e/ou links em chats fora dos canais designados, e a promoção de **cheats ou programas ilegais** irão causar punição imediata. Mantenha a integridade do Void.',
            inline: false,
        },
        {
            name: '<a:checkmark_void88:1320743200591188029> 5. Poluição Sonora (Voice Chat)',
            value: 'Poluição sonora em canais de voz (gritar, interromper, entrar/sair repetidamente, colocar efeitos sonoros) apenas para atrapalhar os demais players que estão tentando conversar/jogar, irá gerar punição. Respeite o silêncio do Vazio.',
            inline: false,
        },
        {
            name: '<a:checkmark_void88:1320743200591188029> 6. Uso de Comandos',
            value: 'Não utilize comandos fora dos canais designados para comandos (como no chat geral). O descumprimento levará a um aviso e, na reincidência, as devidas punições serão aplicadas.',
            inline: false,
        },
        {
            name: '<a:checkmark_void88:1320743200591188029> 7. Respeito à Staff e Membros',
            value: 'Ofensa à Staff ou menção de membros da equipe sem motivo e atitudes indesejadas (como provocações/implicância) causarão punição. A hierarquia do Vazio deve ser respeitada.',
            inline: false,
        },
    ];

    // 1. Verificação de Permissão (Apenas Administradores)
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
            content: 'Você não tem permissão para usar este comando. Apenas Administradores podem definir as regras do Vazio.', 
            ephemeral: true 
        });
    }

    const channel = interaction.options.getChannel('channel');

    // 2. Criação do Embed de Regras
    const rulesEmbed = new EmbedBuilder()
        .setColor(globalConfig.embedColor)
        // Título removido conforme solicitado
        .setURL('https://discord.gg/seu_link_do_servidor') // Opcional: Adicione o link do seu servidor aqui
        .setDescription(
            `**Bem-vindo ao Void, viajante.**\n\nPara navegar neste espaço de caos e ordem, siga as diretrizes abaixo. A desobediência atrai a fúria do Vazio. Leia atentamente para garantir sua permanência.`
        )
        .setImage(RULES_BANNER_URL) // Banner no topo
        .setThumbnail(interaction.guild.iconURL({ dynamic: true })) // Ícone do servidor como thumbnail
        .addFields(rulesContent)

        .setTimestamp();

    try {
        // 3. Envio da Mensagem
        await channel.send({ embeds: [rulesEmbed] });

        // 4. Resposta ao Comando
        await interaction.reply({ 
            content: `✅ O Código do Vazio foi enviado com sucesso para o canal ${channel}! **Lembre-se de substituir o link da imagem do banner no código!**`, 
            ephemeral: true 
        });
    } catch (error) {
        console.error('Erro ao enviar o embed de regras:', error);
        await interaction.reply({ 
            content: `❌ Ocorreu um erro ao tentar enviar o embed de regras no canal ${channel}. Verifique se o bot tem permissão de \`Enviar Mensagens\` e \`Embed Links\` neste canal.`, 
            ephemeral: true 
        });
    }
}

// === HANDLERS DE COMANDOS DE ECONOMIA ===
	

	
	async function handleDaily(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	    const now = Date.now();
	    const oneDay = 24 * 60 * 60 * 1000;
	    
	    if (now - user.lastDaily < oneDay) {
	        const remainingTime = user.lastDaily + oneDay - now;
	        const hours = Math.floor(remainingTime / (1000 * 60 * 60));
	        const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
	        const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
	        
	        const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
	            .setColor(globalConfig.embedColor)
	            .setTitle("⏳ Resgate Diário")
	            .setDescription(`Você já resgatou sua recompensa diária!\nVolte em **${hours}h ${minutes}m ${seconds}s** para resgatar novamente.`);
	            
	        return interaction.reply({ embeds: [embed] });
	    }
	
	    const dailyAmount = Math.floor(Math.random() * 500) + 1000; // Entre $1000 e $1500
	    
	    user.bank += dailyAmount;
	    user.lastDaily = now;
	    updateUser(userId, user);
	    
	    const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
	        .setColor(globalConfig.embedColor)
	        .setTitle("<a:money:1242505308442595408> Resgate Diário Concluído!")
	    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
	        .setDescription(`Você resgatou **${formatDollars(dailyAmount)}** e depositou no seu banco.\n\nSeu saldo bancário atual é de **${formatDollars(user.bank)}**.`);
	        
	    return interaction.reply({ embeds: [embed] });
	}
	
	async function handleBalance(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	    
	    const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
	        .setColor(globalConfig.embedColor)
	        .setTitle(`Carteira de ${interaction.user.tag}`)
	    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
	        .addFields(
	            { name: '<a:richxp:1464679900500988150> Carteira (Wallet)', value: formatDollars(user.wallet), inline: true },
	            { name: '🏦 Banco (Bank)', value: formatDollars(user.bank), inline: true }
	        )
	        .setFooter({ text: "Use /daily para resgatar dólares diariamente." })
	        .setTimestamp();
	        
	    return interaction.reply({ embeds: [embed] });
	}
	
	async function handleTransfer(interaction) {
	    const senderId = interaction.user.id;
	    const receiver = interaction.options.getUser('user');
	    const amount = interaction.options.getNumber('amount');
	
	    if (amount <= 0 || !Number.isInteger(amount)) {
	        return interaction.reply({ content: "A quantia a ser transferida deve ser um número inteiro positivo.", ephemeral: true });
	    }
	    
	    const sender = getUser(senderId, interaction.user.tag);
	    const receiverUser = getUser(receiver.id, receiver.tag);
	
	    if (sender.bank < amount) {
	        return interaction.reply({ content: `Você não tem ${formatDollars(amount)} no banco para transferir.`, ephemeral: true });
	    }
	
	    sender.bank -= amount;
	    receiverUser.bank += amount;
	    updateUser(senderId, sender);
	    updateUser(receiver.id, receiverUser);
	
	    const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
	        .setColor(globalConfig.embedColor)
	        .setTitle("💸 Transferência Concluída")
	        .setDescription(`Você transferiu **${formatDollars(amount)}** do seu banco para ${receiver}.`)
	        .addFields(
	            { name: 'Seu Novo Saldo Bancário', value: formatDollars(sender.bank), inline: true },
	            { name: 'Saldo Bancário do Destinatário', value: formatDollars(receiverUser.bank), inline: true }
	        );
	        
	    return interaction.reply({ embeds: [embed] });
	}
	
	async function handleCrash(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	    const bet = interaction.options.getNumber('bet');
	
	    if (bet <= 0 || !Number.isInteger(bet)) {
	        return interaction.reply({ content: "A aposta deve ser um número inteiro positivo.", ephemeral: true });
	    }
	
	    if (user.wallet < bet) {
	        return interaction.reply({ content: `Você não tem ${formatDollars(bet)} na carteira para apostar.`, ephemeral: true });
	    }
	
	    const now = Date.now();
	    const cooldownTime = 10000; // 10 segundos de cooldown
	
	    if (now - user.lastCrash < cooldownTime) {
	        const remainingTime = user.lastCrash + cooldownTime - now;
	        const seconds = Math.ceil(remainingTime / 1000);
	        return interaction.reply({ content: `Você deve esperar ${seconds} segundos antes de jogar Crash novamente.`, ephemeral: true });
	    }
	
	    user.wallet -= bet;
	    user.lastCrash = now;
	    updateUser(userId, user);
	
	    const crashPoint = Math.random() < 0.05 ? 1.00 : (Math.random() * 10) + 1.01; // 5% de chance de crash instantâneo
	    let hasCashedOut = false;
	
	    const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
	        .setColor(globalConfig.embedColor)
	        .setTitle("<a:rocket:1466151179049238549> CRASH - O Foguete está Subindo!")
	        .setDescription(`Aposta: **${formatDollars(bet)}**\nMultiplicador Atual: **1.00x**\n\nClique em "Cash Out" para sacar seus ganhos!`);
	
	    const cashOutButton = new ButtonBuilder()
	        .setCustomId('crash_cashout')
	        .setLabel('Cash Out (1.00x)')
	        .setStyle(ButtonStyle.Success);
	
	    const message = await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(cashOutButton)], fetchReply: true });
	
	    const filter = i => i.customId === 'crash_cashout' && i.user.id === userId;
	    const collector = message.createMessageComponentCollector({ filter, time: 60000 });
	
	    let multiplier = 1.00;
	    const interval = setInterval(() => {
	        if (hasCashedOut) return clearInterval(interval);
	
	        multiplier += 0.5;
	        
	        if (multiplier >= crashPoint) {
	            clearInterval(interval);
	            if (!hasCashedOut) {
	                const resultEmbed = new EmbedBuilder().setColor(globalConfig.embedColor)
	                    .setColor(globalConfig.embedColor)
	                    .setTitle("<a:crash:1466151722698408016> CRASH!")
	                    .setDescription(`Você perdeu **${formatDollars(bet)}**.\n\nO foguete explodiu em **${crashPoint.toFixed(2)}x**!`);
	                    
	                cashOutButton.setDisabled(true).setLabel('Explodiu!');
	                message.edit({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	            }
	            collector.stop('crash');
	            return;
	        }
	
	        embed.setDescription(`Aposta: **${formatDollars(bet)}**\nMultiplicador Atual: **${multiplier.toFixed(2)}x**\n\nClique em "Cash Out" para sacar seus ganhos!`);
	        cashOutButton.setLabel(`Cash Out (${multiplier.toFixed(2)}x)`);
	        message.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	    }, 500);
	
	    collector.on('collect', async i => {
	        if (hasCashedOut) return i.reply({ content: "Você já sacou!", ephemeral: true });
	        hasCashedOut = true;
	        clearInterval(interval);
	
	        const winnings = Math.floor(bet * multiplier);
	        const profit = winnings - bet;
	        user.wallet += winnings;
	        updateUser(userId, user);
	
	        const resultEmbed = new EmbedBuilder().setColor(globalConfig.embedColor)
	            .setColor(globalConfig.embedColor)
	            .setTitle("<a:checkmark_void88:1320743200591188029> CASH OUT!")
	            .setDescription(`Você sacou em **${multiplier.toFixed(2)}x** e ganhou **${formatDollars(winnings)}** (Lucro: ${formatDollars(profit)}).\n\nSeu novo saldo na carteira é de **${formatDollars(user.wallet)}**.`);
	            
	        cashOutButton.setDisabled(true).setLabel(`Sacou em ${multiplier.toFixed(2)}x`);
	        i.update({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] });
	        collector.stop('cashout');
	    });
	
	    collector.on('end', (collected, reason) => {
	        if (reason === 'time') {
	            if (!hasCashedOut) {
	                const resultEmbed = new EmbedBuilder().setColor(globalConfig.embedColor)
	                    .setColor(globalConfig.embedColor)
	                    .setTitle("<a:crash:1466151722698408016> CRASH!")
	                    .setDescription(`Você perdeu **${formatDollars(bet)}**.\n\nO tempo acabou e o foguete explodiu em **${crashPoint.toFixed(2)}x**!`);
	                    
	                cashOutButton.setDisabled(true).setLabel('Explodiu!');
	                message.edit({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	            }
	        } else if (reason === 'crash' && !hasCashedOut) {
	            // Lida com o crash se não tiver feito cash out antes
	            const resultEmbed = new EmbedBuilder().setColor(globalConfig.embedColor)
	                .setColor(globalConfig.embedColor)
	                .setTitle("<a:crash:1466151722698408016> CRASH!")
	                .setDescription(`Você perdeu **${formatDollars(bet)}**.\n\nO foguete explodiu em **${crashPoint.toFixed(2)}x**!`);
	                
	            cashOutButton.setDisabled(true).setLabel('Explodiu!');
	            message.edit({ embeds: [resultEmbed], components: [new ActionRowBuilder().addComponents(cashOutButton)] }).catch(() => {});
	        }
	    });
	}
async function sendLog(guild, embed) { const config = logConfig[guild.id]; if (!config?.channelId) return; try { const channel = await guild.channels.fetch(config.channelId); if (channel?.isTextBased()) await channel.send({ embeds: [embed] }); } catch (e) {} }
function getLevel(currentXP) { let level = 0; for (let i = 0; i < LEVELS.length; i++) { if (currentXP >= LEVELS[i]) level = i + 1; else break; } return level; }
async function updateRankingRoles(guild) {
    const config = rankingRolesConfig[guild.id];
    if (!config || !config.roleId1 || !config.roleId2 || !config.roleId3) return;

    const guildXP = xp[guild.id] || {};
    const sortedXP = Object.entries(guildXP)
        .sort(([, xpA], [, xpB]) => xpB - xpA)
        .slice(0, 3); // Pega o Top 3

    const topUsers = sortedXP.map(([userId]) => userId);
    const roleIds = [config.roleId1, config.roleId2, config.roleId3];
    const currentTopUsers = config.currentTopUsers || {};

    for (let i = 0; i < 3; i++) {
        const position = i + 1;
        const roleId = roleIds[i];
        const newTopUserId = topUsers[i];
        const oldTopUserId = currentTopUsers[position];

        // 1. Remover o cargo do usuário anterior (se existir e não for o novo Top)
        if (oldTopUserId && oldTopUserId !== newTopUserId) {
            try {
                const oldMember = await guild.members.fetch(oldTopUserId).catch(() => null);
                if (oldMember) {
                    await oldMember.roles.remove(roleId, `Perdeu a posição #${position} no ranking de XP.`);
                    console.log(`[RankingRoles] Cargo #${position} removido de ${oldMember.user.tag}.`);
                }
            } catch (e) {
                console.error(`[RankingRoles] Erro ao remover cargo #${position} de ${oldTopUserId}:`, e);
            }
        }

        // 2. Atribuir o cargo ao novo usuário Top (se existir e não for o usuário anterior)
        if (newTopUserId && newTopUserId !== oldTopUserId) {
            try {
                const newMember = await guild.members.fetch(newTopUserId).catch(() => null);
                if (newMember) {
                    await newMember.roles.add(roleId, `Alcançou a posição #${position} no ranking de XP.`);
                    console.log(`[RankingRoles] Cargo #${position} atribuído a ${newMember.user.tag}.`);
                }
            } catch (e) {
                console.error(`[RankingRoles] Erro ao atribuir cargo #${position} a ${newTopUserId}:`, e);
            }
        }

        // 3. Atualizar o registro do Top 3
        if (newTopUserId) {
            currentTopUsers[position] = newTopUserId;
        } else {
            delete currentTopUsers[position];
        }
    }

    // Salvar a nova configuração de Top Users
    config.currentTopUsers = currentTopUsers;
    saveRankingRolesConfig();
}

async function getLeaderboardEmbed(guild, page = 0) { 
    const guildXP = xp[guild.id] || {}; 
    const sortedXP = Object.entries(guildXP).sort(([, xpA], [, xpB]) => xpB - xpA);
    const totalPages = Math.ceil(sortedXP.length / 10) || 1;
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    
    const start = currentPage * 10;
    const end = start + 10;
    const pageXP = sortedXP.slice(start, end);
    
    const embed = new EmbedBuilder()
        .setColor(globalConfig.embedColor)
        .setTitle("<a:money:1242505304227446794> Rank - " + guild.name)
        .setDescription("### <a:nitro:1465295896936841369> Bônus de Impulso\nQuem der **impulso (boost)** no servidor tem direito a **1.5x mais XP e Dinheiro**!\n\nO XP e o Dinheiro são dropados via **chat de voz**, **interações no chat** e muito mais. Continue ativo para subir no ranking!\n\n### <a:money:1242505304227446794> Cargos de Recompensa\n- **TOP 1:** <@&1434914289143250954>\n- **TOP 2:** <@&1434914684561002506>\n- **TOP 3:** <@&1434914601094348880>\n\n### <a:money:1242505308442595408> Comandos de Economia\n- **/bank** - depósito e saque.\n- **/crash** - aposte seu dinheiro.\n- **/balance** - veja seu saldo.\n- **/daily** - receba uma quantidade de dinheiro diariamente.")
        .setImage("https://i.imgur.com/lNjOG8B.jpeg")
        .setFooter({ text: "Página " + (currentPage + 1) + " de " + totalPages + " • Ranking • Atualizado a cada 5 minutos" })
        .setTimestamp();

    if (sortedXP.length === 0) {
        embed.setDescription("Ninguém ainda ganhou XP neste servidor.");
        return { embeds: [embed], components: [] };
    } else {
        const leftColumn = pageXP.slice(0, 5);
        const rightColumn = pageXP.slice(5, 10);

        const formatEntry = async (userId, userXP, index) => {
            const absoluteIndex = start + index;
            const medal = absoluteIndex === 0 ? "🥇" : absoluteIndex === 1 ? "🥈" : absoluteIndex === 2 ? "🥉" : "**#" + (absoluteIndex + 1) + "**";
            
            let namePrefix = "";
            let userName = "Usuário Desconhecido";
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    userName = member.user.username;
                    if (member.premiumSince) {
                        namePrefix = "<a:nitro:1465295896936841369> ";
                    }
                }
            } catch (e) {}

            const userData = economy[userId] || { wallet: 0, bank: 0 };
            const totalMoney = userData.wallet + userData.bank;

            return medal + " " + namePrefix + "**" + userName + "**\n└ <a:xp:1320858569037582336> **Lvl " + getLevel(userXP) + "** | `" + userXP + " XP`\n└ <a:richxp:1464679900500988150> **" + formatDollars(totalMoney) + "**";
        };

        const leftContent = await Promise.all(leftColumn.map(([userId, userXP], i) => formatEntry(userId, userXP, i)));
        const rightContent = await Promise.all(rightColumn.map(([userId, userXP], i) => formatEntry(userId, userXP, i + 5)));

        embed.addFields(
            { 
                name: "TOP " + (start + 1) + "-" + (start + 5), 
                value: leftContent.join("\n\n") || "—", 
                inline: true 
            },
            { 
                name: "TOP " + (start + 6) + "-" + (start + 10), 
                value: rightContent.join("\n\n") || "—", 
                inline: true 
            }
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("lb_prev_" + currentPage)
                .setEmoji('<a:left:1465298232140627969>')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId("lb_next_" + currentPage)
                .setEmoji('<a:Right:1465298137890422786>')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage >= totalPages - 1)
        );

        return { embeds: [embed], components: [row] };
    }
}
async function updateAllLeaderboards() { 
		    // Atualiza os Cargos de Ranking (novo)
		    for (const guildId in rankingRolesConfig) {
		        const guild = client.guilds.cache.get(guildId);
		        if (guild) {
		            await updateRankingRoles(guild);
		        }
		    }

		    // Atualiza o Leaderboard de XP (existente)
		    for (const guildId in leaderboardConfig) { 
		        const config = leaderboardConfig[guildId]; 
		        const guild = client.guilds.cache.get(guildId); 
		        if (!guild) { 
		            delete leaderboardConfig[guildId]; 
		            saveLeaderboardConfig(); 
		            continue; 
		        } 
		        try { 
		            const channel = await guild.channels.fetch(config.channelId); 
		            const message = await channel.messages.fetch(config.messageId); 
		            const lbData = await getLeaderboardEmbed(guild); await message.edit({ embeds: lbData.embeds, components: lbData.components }); 
		        } catch (e) { 
		            if ([10003, 10008, 10004].includes(e.code)) { 
		                delete leaderboardConfig[guildId]; 
		                saveLeaderboardConfig(); 
		            } 
		        } 
		    } 
		
		    // Atualiza o Leaderboard de Economia (novo)
		    for (const guildId in economyLeaderboardConfig) { 
		        const config = economyLeaderboardConfig[guildId]; 
		        const guild = client.guilds.cache.get(guildId); 
		        if (!guild) { 
		            delete economyLeaderboardConfig[guildId]; 
		            saveEconomyLeaderboardConfig(); 
		            continue; 
		        } 
		        try { 
		            const channel = await guild.channels.fetch(config.channelId); 
		            const message = await channel.messages.fetch(config.messageId); 
		            const econData = await getEconomyLeaderboardEmbed(guild); await message.edit({ embeds: econData.embeds, components: econData.components }); 
		        } catch (e) { 
		            if ([10003, 10008, 10004].includes(e.code)) { 
		                delete economyLeaderboardConfig[guildId]; 
		                saveEconomyLeaderboardConfig(); 
		            } 
		        } 
		    }
		}
function getSupportMessage(guild) { const embed = new EmbedBuilder().setColor(globalConfig.embedColor).setTitle(`Olá, Void | .gg/wvoid 💀! Fui adicionado!`).setDescription(`Sou o **VoidSynth**, seu novo bot de gerenciamento e diversão.\n\nUse \`/help\` para ver minhas funcionalidades.\n\n---\n\n✨ **Apoie o Projeto!**\nSe você gosta do meu trabalho, considere apoiar o desenvolvimento para me manter online e com novas funcionalidades.`).setThumbnail(client.user.displayAvatarURL()).setFooter({ text: `Obrigado por me escolher! | ID: ${guild.id}` }).setTimestamp(); const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Seja Apoiador (PIX)').setStyle(ButtonStyle.Link).setURL('https://cdn.discordapp.com/attachments/1418607672529387654/1431647616319356948/image.png?ex=68fe2d3e&is=68fcdbbe&hm=af9da616a2ba10430be9b0e90827d098d2bc18b2197ab7e8b035795018fe7832&'  )); return { embeds: [embed], components: [row] }; }

// === FUNÇÕES AUTOPFP ===
function sanitizeFileName(fileName) {
    const ext = path.extname(fileName);
    const name = path.basename(fileName, ext);
    // Remove caracteres que o Discord/Sistemas podem ter dificuldade em ler
    // Mantém apenas letras, números, hífens e underscores
    const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'image';
    return sanitized + ext;
}

function getThreeSequentialImages(files, guildId) {
    if (!autopfpConfig[guildId]) autopfpConfig[guildId] = {};
    let currentIndex = autopfpConfig[guildId].lastIndex || 0;
    
    // Ordena os arquivos alfabeticamente para garantir uma ordem consistente
    const sortedFiles = files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    const selectedImages = [];
    for (let i = 0; i < 3; i++) {
        if (currentIndex >= sortedFiles.length) currentIndex = 0;
        selectedImages.push(sortedFiles[currentIndex]);
        currentIndex++;
    }
    
    // Salva o próximo índice para a próxima execução
    autopfpConfig[guildId].lastIndex = currentIndex;
    saveAutoPfpConfig();
    
    return selectedImages;
}

async function runAutoPfp(guildId) {
    const config = autopfpConfig[guildId];
    if (!config || !config.enabled || !config.channelId) return;

    try {
        if (!fs.existsSync(IMAGE_FOLDER)) {
            console.error(`❌ Pasta de imagens não encontrada: ${IMAGE_FOLDER}`);
            return;
        }

        const allFiles = fs.readdirSync(IMAGE_FOLDER).filter(file => /\.(jpe?g|png|gif)$/i.test(file));
        if (allFiles.length === 0) {
            console.warn(`⚠️ Nenhuma imagem encontrada na pasta: ${IMAGE_FOLDER}`);
            return;
        }

        const imagesToSend = getThreeSequentialImages(allFiles, guildId);
        const channel = await client.channels.fetch(config.channelId).catch(() => null);

        if (channel && channel.isTextBased()) {
            for (const file of imagesToSend) {
                let currentFile = file;
                let filePath = path.join(IMAGE_FOLDER, file);
                
                // Verifica se o nome do arquivo precisa ser limpo
                const sanitizedName = sanitizeFileName(file);
                if (sanitizedName !== file) {
                    const newPath = path.join(IMAGE_FOLDER, sanitizedName);
                    try {
                        fs.renameSync(filePath, newPath);
                        currentFile = sanitizedName;
                        filePath = newPath;
                        console.log(`♻️ [AutoPFP] Arquivo renomeado: "${file}" -> "${sanitizedName}"`);
                    } catch (err) {
                        console.error(`❌ [AutoPFP] Erro ao renomear "${file}":`, err);
                    }
                }

                const attachment = { attachment: filePath, name: currentFile };
                
                const now = new Date();
                const brtTime = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

                const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
                    .setImage(`attachment://${currentFile}`) // Referencia o arquivo anexado.
                    .setColor(globalConfig.embedColor)
                    .setFooter({ text: `Postado às ${brtTime} (BRT)` });

                await channel.send({ embeds: [embed], files: [attachment] });
            }
            console.log(`✅ [AutoPFP] Enviadas 3 imagens em embeds separados para o canal ${channel.id} no servidor ${guildId}`);
        } else {
            console.error(`❌ [AutoPFP] Canal ${config.channelId} não encontrado ou não é um canal de texto.`);
        }
    } catch (e) {
        console.error(`❌ Erro no loop AutoPFP para o servidor ${guildId}:`, e);
    }
}

function startAutoPfpLoop(guildId) {
    if (autopfpIntervals.has(guildId)) {
        clearInterval(autopfpIntervals.get(guildId));
    }
    
    // Executa imediatamente e depois a cada 5 minutos (300000ms)
    const interval = setInterval(() => runAutoPfp(guildId), 300000);
    autopfpIntervals.set(guildId, interval);
    runAutoPfp(guildId); // Primeira execução imediata
}

function stopAutoPfpLoop(guildId) {
    if (autopfpIntervals.has(guildId)) {
        clearInterval(autopfpIntervals.get(guildId));
        autopfpIntervals.delete(guildId);
        return true;
    }
    return false;
}

function restartAllAutoPfpLoops() {
    for (const guildId in autopfpConfig) {
        const config = autopfpConfig[guildId];
        if (config.enabled) {
            startAutoPfpLoop(guildId);
        }
    }
}

// === EVENTO READY ===
client.on("ready", async () => {
    client.user.setActivity('/help', { type: ActivityType.Watching });
    // Garante que os arquivos de configuração essenciais existam
    if (!fs.existsSync('./economy_leaderboard_config.json')) {
        fs.writeFileSync('./economy_leaderboard_config.json', '{}');
    }
    if (!fs.existsSync('./global_config.json')) {
        fs.writeFileSync('./global_config.json', JSON.stringify({ embedColor: "#000102" }, null, 2));
    }
    console.log(`✅ Logado como ${client.user.tag}!`);
    loadAllConfigs();

    // Força o status do bot a cada 30 segundos para sobrescrever qualquer status externo
    setInterval(() => {
        client.user.setActivity('/help', { type: ActivityType.Watching });
    }, 30000); // 30 segundos
    const syncInterval = async () => {
        await rewardVoiceUsers();
        await updateAllLeaderboards();
    };
    syncInterval(); // Executa imediatamente ao ligar
    setInterval(syncInterval, 300000); // Repete a cada 5 minutos
    
    restartAllAutoPfpLoops(); // Adicionado para retomar o loop AutoPFP
    
    // Inicia os intervalos de mensagens automáticas para todas as guildas configuradas
    for (const guildId in autoMessageConfig) {
        if (autoMessageConfig[guildId].enabled) {
            startAutoMessages(guildId);
        }
    }
    
    console.log("✅ Sistemas iniciados.");

    // === LISTA DE COMANDOS (LOCAL) ===
    commandsList = [
        { name: 'help', description: 'Exibe a lista de comandos.' },
                { name: 'auto-mensagem', description: 'Configura mensagens automáticas recorrentes. (Admin)', options: [
            { name: 'acao', description: 'Ativar, desativar ou ver config.', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Ativar/Configurar', value: 'on' }, { name: 'Desativar', value: 'off' }, { name: 'Configuração Atual', value: 'status' }] },
            { name: 'canal', description: 'Canal onde a mensagem será enviada.', type: ApplicationCommandOptionType.Channel, required: false },
            { name: 'mensagem', description: 'A mensagem que será enviada.', type: ApplicationCommandOptionType.String, required: false },
            { name: 'intervalo', description: 'Intervalo em minutos.', type: ApplicationCommandOptionType.Integer, required: false, minValue: 1 },
            { name: 'cargo', description: 'Cargo para marcar na mensagem.', type: ApplicationCommandOptionType.Role, required: false }
        ] },
        { name: 'ping', description: 'Exibe a latência do bot.' },
        { name: 'rank', description: 'Mostra seu nível e XP atual.' },
        { name: 'rankvoid', description: 'Mostra o canal do Rank (XP e Economia).' },
        { name: 'daily', description: 'Resgate sua recompensa diária de dólares.' },
        { name: 'balance', description: 'Mostra seu saldo de Dollars (carteira e banco).' },
        { name: 'transfer', description: 'Transfere dólares para outro usuário.', options: [{ name: 'user', description: 'O usuário para quem transferir.', type: ApplicationCommandOptionType.User, required: true }, { name: 'amount', description: 'A quantidade de dólares a transferir.', type: ApplicationCommandOptionType.Number, required: true }] },
        { name: 'setruleschannel', description: 'Define o canal e envia o Embed de Regras do servidor Void. (Admin)', options: [{ name: 'channel', description: 'O canal de texto onde as regras serão enviadas.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'setrankingroles', description: 'Configura os cargos para o Top 1, Top 2 e Top 3 do ranking de XP. (Admin)', options: [
            { name: 'top1_role', description: 'O cargo para o Top 1.', type: ApplicationCommandOptionType.Role, required: true },
            { name: 'top2_role', description: 'O cargo para o Top 2.', type: ApplicationCommandOptionType.Role, required: true },
            { name: 'top3_role', description: 'O cargo para o Top 3.', type: ApplicationCommandOptionType.Role, required: true }
        ] },
        { name: 'crash', description: 'Jogue o famoso Crash e tente multiplicar seus dólares.', options: [{ name: 'bet', description: 'A quantidade de dólares a apostar.', type: ApplicationCommandOptionType.Number, required: true }] },
        { name: 'bank', description: 'Abre o menu do banco para depositar e sacar.' },
        { name: 'avatar', description: 'Mostra o avatar de um usuário.', options: [{ name: 'user', description: 'O usuário.', type: ApplicationCommandOptionType.User, required: false }] },
        { name: 'apoiador', description: 'Mostra como apoiar o projeto.' },
        { name: 'clear', description: 'Apaga mensagens. (Admin)', options: [{ name: 'amount', description: 'Número de mensagens (1-100).', type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 100 }] },
        { name: 'setrankvoid', description: 'Configura o Rank (XP e Economia). (Admin)', options: [{ name: 'channel', description: 'O canal de texto.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'setupvoice', description: 'Configura o sistema de voz temporário. (Admin)', options: [{ name: 'channel', description: 'O canal para criar salas.', type: ApplicationCommandOptionType.Channel, required: true }, { name: 'category', description: 'A categoria para as novas salas.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'vcpanel', description: 'Envia o painel de controle de voz. (Admin)' },
        { name: 'setregister', description: 'Envia a mensagem de registro. (Admin)', options: [{ name: 'channel', description: 'O canal.', type: ApplicationCommandOptionType.Channel, required: true }, { name: 'role', description: 'O cargo a ser concedido.', type: ApplicationCommandOptionType.Role, required: true }, { name: 'gif_url', description: 'URL de uma imagem/GIF (opcional).', type: ApplicationCommandOptionType.String, required: false }] },
        { name: 'setwelcome', description: 'Configura as boas-vindas. (Admin)', options: [{ name: 'channel', description: 'O canal.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'setlogchannel', description: 'Configura o canal de logs. (Admin)', options: [{ name: 'channel', description: 'O canal.', type: ApplicationCommandOptionType.Channel, required: true }] },
        { name: 'antinuke', description: 'Configura o sistema Antinuke. (Admin)', options: [{ name: 'action', description: 'Ativar ou desativar.', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'ativar', value: 'enable' }, { name: 'desativar', value: 'disable' }] }] },
        { name: 'adminpanel', description: 'Envia o painel de moderação estático no canal atual. (Admin)' },
        { name: 'autopfp', description: 'Configura o loop de envio de imagens automáticas (AutoPFP). (Admin)', options: [
            { name: 'action', description: 'Ação a ser executada.', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'start', value: 'start' }, { name: 'stop', value: 'stop' }] },
            { name: 'channel', description: 'O canal de texto para o AutoPFP (apenas para "start").', type: ApplicationCommandOptionType.Channel, required: false }
        ] },
        { name: 'config-loja', description: 'Configura a loja do servidor. (Admin)', options: [
            { name: 'banner', description: 'URL da imagem/GIF do banner da loja.', type: ApplicationCommandOptionType.String, required: true },
            { name: 'cargo1', description: 'Cargo 1', type: ApplicationCommandOptionType.Role, required: true },
            { name: 'preco1', description: 'Preço 1', type: ApplicationCommandOptionType.Number, required: true },
            { name: 'cargo2', description: 'Cargo 2', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco2', description: 'Preço 2', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo3', description: 'Cargo 3', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco3', description: 'Preço 3', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo4', description: 'Cargo 4', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco4', description: 'Preço 4', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo5', description: 'Cargo 5', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco5', description: 'Preço 5', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo6', description: 'Cargo 6', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco6', description: 'Preço 6', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo7', description: 'Cargo 7', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco7', description: 'Preço 7', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo8', description: 'Cargo 8', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco8', description: 'Preço 8', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo9', description: 'Cargo 9', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco9', description: 'Preço 9', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'cargo10', description: 'Cargo 10', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco10', description: 'Preço 10', type: ApplicationCommandOptionType.Number, required: false }
        ] },
        { name: 'editar-loja', description: 'Edita o visual da loja (Banner, Título, Descrição). (Admin)', options: [
            { name: 'message_id', description: 'ID da mensagem da loja a ser editada.', type: ApplicationCommandOptionType.String, required: true },
            { name: 'banner', description: 'Novo URL do banner.', type: ApplicationCommandOptionType.String, required: false },
            { name: 'titulo', description: 'Novo título personalizado da loja.', type: ApplicationCommandOptionType.String, required: false },
            { name: 'descricao', description: 'Nova descrição personalizada da loja.', type: ApplicationCommandOptionType.String, required: false }
        ] },
        { name: 'editar-item', description: 'Edita um cargo específico da loja. (Admin)', options: [
            { name: 'message_id', description: 'ID da mensagem da loja.', type: ApplicationCommandOptionType.String, required: true },
            { name: 'item_numero', description: 'Número do item a editar (1-10).', type: ApplicationCommandOptionType.Integer, required: true, minValue: 1, maxValue: 10 },
            { name: 'cargo', description: 'Novo Cargo.', type: ApplicationCommandOptionType.Role, required: false },
            { name: 'preco', description: 'Novo Preço.', type: ApplicationCommandOptionType.Number, required: false },
            { name: 'emoji', description: 'Novo Emoji.', type: ApplicationCommandOptionType.String, required: false }
        ] },
        { name: 'atualizar-loja', description: 'Atualiza o visual de uma loja existente sem mudar os itens. (Admin)', options: [
            { name: 'message_id', description: 'ID da mensagem da loja a ser atualizada.', type: ApplicationCommandOptionType.String, required: true }
        ] },
        { name: 'joinvc', description: 'Conecta o bot ao seu canal de voz e o mantém lá por 24 horas.' },
        { name: 'xplog', description: 'Ativa/Desativa os logs de XP em tempo real. (Admin)', options: [{ name: 'status', description: 'Ativar ou Desativar', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Ativar', value: 'on' }, { name: 'Desativar', value: 'off' }] }, { name: 'canal', description: 'Canal para enviar os logs', type: ApplicationCommandOptionType.Channel, required: false }] },
        { name: 'atualizarembedscolor', description: 'Atualiza a cor de todos os embeds do bot. (Admin)', options: [
            { name: 'cor', description: 'A cor em formato HEX (ex: #000102).', type: ApplicationCommandOptionType.String, required: true }
        ] },
        { name: 'filtro', description: 'Configura o filtro de palavras do servidor. (Admin)', options: [
            { name: 'acao', description: 'Adicionar ou remover palavra.', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Adicionar', value: 'add' }, { name: 'Remover', value: 'remove' }, { name: 'Listar', value: 'list' }] },
            { name: 'palavra', description: 'A palavra a ser filtrada (não necessária para "Listar").', type: ApplicationCommandOptionType.String, required: false }
        ] },
        {
            name: 'embed',
            description: 'Cria um embed personalizado. (Admin)',
            options: [
                { name: 'titulo', description: 'O título do embed.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'descricao', description: 'A descrição do embed.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'cor', description: 'A cor do embed em HEX (ex: #FF0000).', type: ApplicationCommandOptionType.String, required: false },
                { name: 'imagem', description: 'URL da imagem do embed.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'thumbnail', description: 'URL da thumbnail do embed.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'rodape', description: 'Texto do rodapé.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'canal', description: 'Canal onde o embed será enviado.', type: ApplicationCommandOptionType.Channel, required: false },
                { name: 'botao_label', description: 'O texto que aparecerá no botão.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'botao_link', description: 'O link (URL) que o botão abrirá.', type: ApplicationCommandOptionType.String, required: false }
            ]
        },
        {
            name: 'edit-embed',
            description: 'Edita um embed já enviado pelo bot. (Admin)',
            options: [
                { name: 'message_id', description: 'O ID da mensagem do embed a ser editado.', type: ApplicationCommandOptionType.String, required: true },
                { name: 'titulo', description: 'O novo título do embed.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'descricao', description: 'A nova descrição do embed.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'cor', description: 'A nova cor do embed em HEX.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'imagem', description: 'Nova URL da imagem.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'thumbnail', description: 'Nova URL da thumbnail.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'rodape', description: 'Novo texto do rodapé.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'canal', description: 'Canal onde a mensagem está (se não for o atual).', type: ApplicationCommandOptionType.Channel, required: false },
                { name: 'botao_label', description: 'Novo texto do botão.', type: ApplicationCommandOptionType.String, required: false },
                { name: 'botao_link', description: 'Novo link do botão.', type: ApplicationCommandOptionType.String, required: false }
            ]
        },
    ];

    // === REGISTRO DE COMANDOS INSTANTÂNEO (GUILD COMMANDS) ===
    const commands = commandsList;
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('⏳ Iniciando sincronização instantânea de comandos...');

        // 1. Limpa comandos globais (que demoram a atualizar) para evitar duplicidade
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        console.log('   - Comandos globais limpos (para evitar atrasos).');

        // 2. Registra os comandos diretamente em cada servidor (Guild Commands)
        // Isso faz com que os comandos apareçam NA HORA na barra.
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
            console.log(`✅ Comandos registrados instantaneamente no servidor: ${guildId}`);
        }
        
        console.log(`🚀 Sincronização concluída! ${commands.length} comandos ativos.`);
        console.log('💡 Dica: Se ainda não vir, reinicie seu Discord (Ctrl+R).');
    } catch (error) {
        console.error('❌ Erro ao sincronizar comandos:', error);
    }

    });





// === EVENTOS DE INTERAÇÃO ===
client.on('interactionCreate', async interaction => {
    // === HANDLER DE PAGINAÇÃO DO LEADERBOARD ===
    if (interaction.isButton()) {
        const [type, action, currentPageStr] = (interaction.customId || "").split('_');
        if (type === 'lb' && ['prev', 'next'].includes(action)) {
            const currentPage = parseInt(currentPageStr);
            const newPage = action === 'next' ? currentPage + 1 : currentPage - 1;
            await interaction.deferUpdate();
            const data = await getLeaderboardEmbed(interaction.guild, newPage);
            await interaction.editReply({ embeds: data.embeds, components: data.components });
            return;
        }
    }

    if (interaction.isModalSubmit()) {
        const userId = interaction.user.id;
        const user = getUser(userId, interaction.user.tag);

		        if (interaction.customId === 'modal_deposit') {
		            await interaction.deferReply({ ephemeral: true });
		            const amountStr = interaction.fields.getTextInputValue('deposit_amount').toLowerCase();
		            let amount = amountStr === 'all' ? user.wallet : parseInt(amountStr.replace(/[,.]/g, ''));

		            if (isNaN(amount) || amount <= 0) {
		                return interaction.editReply({ content: 'Por favor, insira um número válido ou "all".' });
		            }
		            if (amount > user.wallet) {
		                return interaction.editReply({ content: `Você não tem ${formatDollars(amount)} para depositar.` });
		            }

		            user.wallet -= amount;
		            user.bank += amount;
		            updateUser(userId, user);

		            const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
		                .setColor(globalConfig.embedColor)
		                .setTitle("<a:checkmark_void88:1320743200591188029> Depósito Realizado")
		        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
		                .setDescription(`Você depositou **${formatDollars(amount)}** no seu banco.`)
		                .addFields(
		                    { name: '<a:richxp:1464679900500988150> Carteira', value: formatDollars(user.wallet), inline: true },
		                    { name: '🏦 Banco', value: formatDollars(user.bank), inline: true }
		                );
		            await interaction.deleteReply(); // Remove a resposta temporária de carregamento
		            await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] }); // Envia a mensagem pública
		            
		            // Adiciona XP após interação bem-sucedida
		            await addXP(interaction.guild, interaction.user, interaction.channel);
		            
		            return;
		        }

			        if (interaction.customId === 'modal_withdraw') {
			            await interaction.deferReply({ ephemeral: true });
			            const amountStr = interaction.fields.getTextInputValue('withdraw_amount').toLowerCase();
			            let amount = amountStr === 'all' ? user.bank : parseInt(amountStr.replace(/[,.]/g, ''));
	
			            if (isNaN(amount) || amount <= 0) {
			                return interaction.editReply({ content: 'Por favor, insira um número válido ou "all".' });
			            }
			            if (amount > user.bank) {
			                return interaction.editReply({ content: `Você não tem ${formatDollars(amount)} para sacar.` });
			            }
	
			            user.bank -= amount;
			            user.wallet += amount;
			            updateUser(userId, user);
	
			            const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
			                .setColor(globalConfig.embedColor)
			                .setTitle("<a:checkmark_void88:1320743200591188029> Saque Realizado")
			        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
			                .setDescription(`Você sacou **${formatDollars(amount)}** do seu banco.`)
			                .addFields(
			                    { name: '<a:richxp:1464679900500988150> Carteira', value: formatDollars(user.wallet), inline: true },
			                    { name: '🏦 Banco', value: formatDollars(user.bank), inline: true }
			                );
			            await interaction.deleteReply(); // Remove a resposta temporária de carregamento
			            await interaction.channel.send({ content: `${interaction.user}`, embeds: [embed] }); // Envia a mensagem pública
			            
			            // Adiciona XP após interação bem-sucedida
			            await addXP(interaction.guild, interaction.user, interaction.channel);
			            
			            return;
			        }

			        if (interaction.customId.startsWith('modalAdmin_')) {
			            await interaction.deferReply({ ephemeral: true });
			            const subAction = interaction.customId.split('_')[1];
			            const targetId = interaction.fields.getTextInputValue('targetId');
			            const reason = interaction.fields.getTextInputValue('reason');
			            
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember && subAction !== 'economy' && subAction !== 'xp') {
			                return interaction.editReply("❌ Não consegui encontrar este membro no servidor.");
			            }

				            const logEmbed = new EmbedBuilder()
				                .setTitle(`<a:_dev1:1329746208553701376> Ação de Moderação: ${subAction.toUpperCase()}`)
				                .setColor(globalConfig.embedColor)
			                .addFields(
			                    { name: "Membro", value: targetMember ? `${targetMember.user.tag} (\`${targetId}\`)` : `ID: \`${targetId}\``, inline: true },
			                    { name: "Staff", value: `${interaction.user.tag}`, inline: true },
			                    { name: "Motivo", value: reason, inline: false }
			                )
			                .setTimestamp();

			            try {
			                switch(subAction) {
			                    case 'ban':
			                        if (!targetMember.bannable) return interaction.editReply("❌ Não posso banir este membro.");
			                        await targetMember.ban({ reason });
			                        break;
			                    case 'kick':
			                        if (!targetMember.kickable) return interaction.editReply("❌ Não posso expulsar este membro.");
			                        await targetMember.kick(reason);
			                        break;
			                    case 'timeout':
			                        const duration = parseInt(interaction.fields.getTextInputValue('duration'));
			                        if (isNaN(duration)) return interaction.editReply("❌ Duração inválida.");
			                        await targetMember.timeout(duration * 60000, reason);
			                        logEmbed.addFields({ name: "Duração", value: `${duration} minutos`, inline: true });
			                        break;
			                    case 'mute':
			                        if (!targetMember.voice.channel) return interaction.editReply("❌ O membro não está em um canal de voz.");
			                        await targetMember.voice.setMute(true, reason);
			                        break;
			                    case 'warn':
			                        await targetMember.send(`⚠️ **Aviso em ${interaction.guild.name}**\n**Motivo:** ${reason}`).catch(() => {});
			                        break;
			                    case 'economy':
			                        const amount = parseFloat(interaction.fields.getTextInputValue('amount'));
			                        if (isNaN(amount)) return interaction.editReply("❌ Quantidade inválida.");
			                        const userData = getUser(targetId, targetMember ? targetMember.user.tag : "Usuário Desconhecido");
			                        userData.bank += amount;
			                        updateUser(targetId, userData);
			                        logEmbed.addFields({ name: "Alteração", value: formatDollars(amount), inline: true });
			                        break;
			                    case 'xp':
			                        const xpAmount = parseInt(interaction.fields.getTextInputValue('amount'));
			                        if (isNaN(xpAmount)) return interaction.editReply("❌ Quantidade de XP inválida.");
			                        if (!xp[interaction.guildId]) xp[interaction.guildId] = {};
			                        xp[interaction.guildId][targetId] = (xp[interaction.guildId][targetId] || 0) + xpAmount;
			                        saveXP();
			                        logEmbed.addFields({ name: "XP Alterado", value: `${xpAmount} XP`, inline: true });
			                        break;
			                }

			                await interaction.editReply(`✅ Ação **${subAction}** executada com sucesso!`);
			                
			                // Envia para o canal de logs se configurado
			                if (logConfig[interaction.guildId]?.channelId) {
			                    const logChannel = interaction.guild.channels.cache.get(logConfig[interaction.guildId].channelId);
			                    if (logChannel) logChannel.send({ embeds: [logEmbed] });
			                }
			            } catch (e) {
			                console.error(e);
			                return interaction.editReply(`❌ Erro ao executar ação: ${e.message}`);
			            }
			            return;
			        }
	    }
	    if (interaction.isButton()) {
if (interaction.customId === 'bank_deposit') {
		            return handleDeposit(interaction);
		        }
		        if (interaction.customId === 'bank_withdraw') {
		            return handleWithdraw(interaction);
		        }
		        
			        const [action] = interaction.customId.split('_');
				
					        if (interaction.customId === 'crash_cashout') return;
							
			        const reply = (c, e = true) => interaction.reply({ content: c, ephemeral: e });
	
			        // Lógica de moderação (Painel Estático e Temporário)
			        if (action === 'admin' || action === 'mod') {
			            // Verifica se é staff (Admin ou tem permissão de moderar)
			            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
			                return reply("❌ Você não tem permissão de staff para usar este painel.");
			            }

			            if (action === 'admin') {
			                const subAction = interaction.customId.split('_')[1];
			                const modal = new ModalBuilder().setCustomId(`modalAdmin_${subAction}`).setTitle(`Moderação: ${subAction.toUpperCase()}`);
			                
			                const idInput = new TextInputBuilder().setCustomId('targetId').setLabel('ID do Membro').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 123456789012345678').setRequired(true);
			                const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setPlaceholder('Descreva o motivo da ação...').setRequired(true);
			                
			                const rows = [new ActionRowBuilder().addComponents(idInput)];
			                
			                if (subAction === 'timeout') {
			                    const durationInput = new TextInputBuilder().setCustomId('duration').setLabel('Duração (em minutos)').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 60').setRequired(true);
			                    rows.push(new ActionRowBuilder().addComponents(durationInput));
			                } else if (subAction === 'economy' || subAction === 'xp') {
			                    const amountInput = new TextInputBuilder().setCustomId('amount').setLabel('Quantidade (Use - para remover)').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 5000 ou -1000').setRequired(true);
			                    rows.push(new ActionRowBuilder().addComponents(amountInput));
			                }
			                
			                rows.push(new ActionRowBuilder().addComponents(reasonInput));
			                modal.addComponents(...rows);
			                return interaction.showModal(modal);
			            }
			            
			            // Lógica antiga do mod temporário (mantida para compatibilidade se necessário)
			            const [_, targetId] = interaction.customId.split('_');
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember) return reply("❌ O membro não está mais no servidor.");
			            if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) return reply("❌ Você não pode moderar alguém com cargo igual ou superior ao seu.");
			            if (!targetMember.manageable) return reply("❌ Não tenho permissão para moderar este membro.");

			            switch(action) {
				                case 'modKick': {
				                    const modal = new ModalBuilder().setCustomId(`modalKick_${targetMember.id}`).setTitle('Expulsar Membro').addComponents(
				                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('kickReason').setLabel('Motivo da Expulsão').setStyle(TextInputStyle.Paragraph).setRequired(true))
				                    );
				                    return interaction.showModal(modal);
				                }
				                case 'modBan': {
				                    const modal = new ModalBuilder().setCustomId(`modalBan_${targetMember.id}`).setTitle('Banir Membro').addComponents(
				                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banReason').setLabel('Motivo do Banimento').setStyle(TextInputStyle.Paragraph).setRequired(true))
				                    );
				                    return interaction.showModal(modal);
				                }
			                case 'modTimeout': {
			                    const modal = new ModalBuilder().setCustomId(`modalTimeout_${targetMember.id}`).setTitle('Aplicar Castigo (Timeout)').addComponents(
			                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('timeoutDuration').setLabel('Duração (em minutos)').setStyle(TextInputStyle.Short).setRequired(true)),
			                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('timeoutReason').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(false))
			                    );
			                    return interaction.showModal(modal);
			                }
				                case 'modMute': {
				                    if (!targetMember.voice.channel) return reply("❌ O membro não está em um canal de voz.");
				                    const modal = new ModalBuilder().setCustomId(`modalMute_${targetMember.id}`).setTitle('Mutar Membro').addComponents(
				                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('muteReason').setLabel('Motivo do Mute').setStyle(TextInputStyle.Paragraph).setRequired(true))
				                    );
				                    return interaction.showModal(modal);
				                }
			            }
			            return;
			        }
		        // Fim da lógica de moderação
		
		        if (action === 'register') {
			            const [_, roleId] = interaction.customId.split('_');
			            const role = interaction.guild.roles.cache.get(roleId);
	            if (!role) return reply("❌ Cargo não encontrado.");
	            if (interaction.member.roles.cache.has(role.id)) return reply("✅ Você já tem este cargo!");
	            await interaction.member.roles.add(role).then(() => reply(`✅ Cargo **${role.name}** concedido!`)).catch(() => reply("❌ Erro ao dar o cargo."));
	            return;
	        }
	
		        // Lógica dos botões de Voz Temporária
		        if (action.startsWith('vc')) {
		            const userChannel = interaction.member.voice.channel;
		            if (!userChannel || !tempVcOwners.has(userChannel.id)) return reply("❌ Você precisa estar em um canal de voz temporário para usar isto.");
	
		            const isOwner = tempVcOwners.get(userChannel.id) === interaction.member.id;
	
		            switch(action) {
	            case 'vcRename': {
	                if (!isOwner) return reply("❌ Apenas o dono do canal pode renomeá-lo.");
	                const modal = new ModalBuilder().setCustomId(`modalRename_${userChannel.id}`).setTitle('Renomear Canal').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newNameInput').setLabel('Novo nome').setStyle(TextInputStyle.Short).setRequired(true)));
	                return interaction.showModal(modal);
	            }
	            case 'vcLimit': {
	                if (!isOwner) return reply("❌ Apenas o dono do canal pode alterar o limite.");
	                const modal = new ModalBuilder().setCustomId(`modalLimit_${userChannel.id}`).setTitle('Definir Limite').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('newLimitInput').setLabel('Novo limite (0 para ilimitado)').setStyle(TextInputStyle.Short).setRequired(true).setValue(userChannel.userLimit.toString())));
	                return interaction.showModal(modal);
	            }
	            case 'vcKick': {
	                if (!isOwner) return reply("❌ Apenas o dono do canal pode expulsar membros.");
	                const members = userChannel.members.filter(m => m.id !== interaction.member.id);
	                if (members.size === 0) return reply("❌ Não há outros membros para expulsar.");
	                const menu = new StringSelectMenuBuilder().setCustomId(`kickMenu_${userChannel.id}`).setPlaceholder('Selecione um membro para expulsar').addOptions(members.map(m => ({ label: m.user.username, value: m.id })));
	                return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
	            }
	            case 'vcLock': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false }); return reply("🔒 Canal trancado."); } else return reply("❌ Apenas o dono pode trancar.");
	            case 'vcUnlock': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true }); return reply("🔓 Canal destrancado."); } else return reply("❌ Apenas o dono pode destrancar.");
	            case 'vcHide': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false }); return reply("👁️ Canal ocultado."); } else return reply("❌ Apenas o dono pode ocultar.");
	            case 'vcReveal': if (isOwner) { await userChannel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true }); return reply("📢 Canal revelado."); } else return reply("❌ Apenas o dono pode revelar.");
	            case 'vcClaim': {
	                const ownerId = tempVcOwners.get(userChannel.id);
	                const owner = interaction.guild.members.cache.get(ownerId);
	                if (owner && owner.voice.channelId === userChannel.id) return reply("❌ O dono ainda está no canal.");
	                tempVcOwners.set(userChannel.id, interaction.member.id);
	                await userChannel.permissionOverwrites.edit(interaction.member.id, { ManageChannels: true });
	                return reply("👑 Você reivindicou a posse do canal!");
	            }
	            case 'vcIncrease': if (isOwner) { const newLimit = Math.min(userChannel.userLimit + 1, 99); await userChannel.setUserLimit(newLimit); return reply(`➕ Limite aumentado para ${newLimit}.`); } else return reply("❌ Apenas o dono pode aumentar o limite.");
	            case 'vcDecrease': if (isOwner) { const newLimit = Math.max(userChannel.userLimit - 1, 0); await userChannel.setUserLimit(newLimit); return reply(`➖ Limite diminuído para ${newLimit}.`); } else return reply("❌ Apenas o dono pode diminuir o limite.");
		            case 'vcDelete': if (isOwner) { await userChannel.delete("Deletado pelo dono."); return reply("🗑️ Canal deletado."); } else return reply("❌ Apenas o dono pode deletar o canal.");
	
		            }
		            return;
		        }
		    }
	
if (interaction.isStringSelectMenu()) {
		        if (interaction.customId === 'shop_buy_menu') {
		            const roleId = interaction.values[0];
		            const guildId = interaction.guildId;
		            const shop = shopConfig[guildId];
		            if (!shop) return interaction.reply({ content: "❌ Loja não configurada.", ephemeral: true });
		            
		            const item = shop.items.find(i => i.roleId === roleId);
		            if (!item) return interaction.reply({ content: "❌ Item não encontrado na loja.", ephemeral: true });
		            
		            const userId = interaction.user.id;
		            const user = getUser(userId, interaction.user.tag);
		            
		            if (interaction.member.roles.cache.has(roleId)) {
		                return interaction.reply({ content: "✅ Você já possui este cargo!", ephemeral: true });
		            }
		            
		            if (user.bank < item.price) {
		                return interaction.reply({ content: `❌ Você não tem saldo suficiente no banco. Preço: **${formatDollars(item.price)}**`, ephemeral: true });
		            }
		            
		            try {
		                await interaction.member.roles.add(roleId);
		                user.bank -= item.price;
		                updateUser(userId, user);
		                return interaction.reply({ content: `✅ Você comprou o cargo <@&${roleId}> por **${formatDollars(item.price)}**!`, ephemeral: true });
		            } catch (e) {
		                console.error(e);
		                return interaction.reply({ content: "❌ Erro ao atribuir o cargo. Verifique minhas permissões.", ephemeral: true });
		            }
		        }

		        const [action, targetId] = interaction.customId.split('_');
		        if (action === 'kickMenu') {
		            const userToKickId = interaction.values[0];
		            const memberToKick = await interaction.guild.members.fetch(userToKickId);
		            if (memberToKick) {
		                await memberToKick.voice.disconnect("Expulso pelo dono do canal.");
		                return interaction.update({ content: `✅ ${memberToKick.user.username} foi expulso do canal.`, components: [] });
		            }
		        }
		        return;
		    }
	
		    if (interaction.isModalSubmit()) { 
		        const [action, targetId] = interaction.customId.split('_'); 
		        
			        if (action === 'modalKick') {
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
			            const reason = interaction.fields.getTextInputValue('kickReason') || 'Sem motivo especificado.';
			            try {
			                await targetMember.kick(reason);
			                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** expulso. Motivo: ${reason}`, ephemeral: true });
			            } catch (e) {
			                return interaction.reply({ content: "❌ Não foi possível expulsar o membro. Verifique minhas permissões.", ephemeral: true });
			            }
			        }
	
			        if (action === 'modalBan') {
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
			            const reason = interaction.fields.getTextInputValue('banReason') || 'Sem motivo especificado.';
			            try {
			                await targetMember.ban({ reason });
			                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** banido. Motivo: ${reason}`, ephemeral: true });
			            } catch (e) {
			                return interaction.reply({ content: "❌ Não foi possível banir o membro. Verifique minhas permissões.", ephemeral: true });
			            }
			        }
	
			        if (action === 'modalMute') {
			            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
			            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
			            const reason = interaction.fields.getTextInputValue('muteReason') || 'Sem motivo especificado.';
			            if (!targetMember.voice.channel) return interaction.reply({ content: "❌ O membro não está em um canal de voz para ser mutado.", ephemeral: true });
			            try {
			                await targetMember.voice.setMute(true, reason);
			                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** mutado no canal de voz. Motivo: ${reason}`, ephemeral: true });
			            } catch (e) {
			                return interaction.reply({ content: "❌ Não foi possível mutar o membro. Verifique minhas permissões.", ephemeral: true });
			            }
			        }
	
			        if (action === 'modalTimeout') {
		            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
		            if (!targetMember) return interaction.reply({ content: "❌ O membro não está mais no servidor.", ephemeral: true });
		
		            const duration = parseInt(interaction.fields.getTextInputValue('timeoutDuration'));
		            const reason = interaction.fields.getTextInputValue('timeoutReason') || 'Sem motivo especificado.';
		
		            if (isNaN(duration) || duration <= 0) return interaction.reply({ content: "❌ Duração de castigo inválida. Use um número inteiro positivo (em minutos).", ephemeral: true });
		            
		            const durationMs = duration * 60 * 1000;
		            const maxDurationMs = 2419200000; // 28 dias
		            
		            if (durationMs > maxDurationMs) return interaction.reply({ content: "❌ A duração máxima de castigo é de 28 dias.", ephemeral: true });
		
		            try {
		                await targetMember.timeout(durationMs, reason);
		                return interaction.reply({ content: `✅ Membro **${targetMember.user.tag}** castigado por ${duration} minutos. Motivo: ${reason}`, ephemeral: true });
		            } catch (e) {
		                return interaction.reply({ content: "❌ Não foi possível aplicar o castigo. Verifique minhas permissões.", ephemeral: true });
		            }
		        }
		
		        const channel = interaction.guild.channels.cache.get(targetId); 
		        if (!channel) return interaction.reply({ content: "❌ Canal não encontrado.", ephemeral: true }); 
		        
		        if (action === 'modalRename') { 
		            await channel.setName(interaction.fields.getTextInputValue('newNameInput')); 
		            return interaction.reply({ content: `✅ Canal renomeado.`, ephemeral: true }); 
		        } 
		        
		        if (action === 'modalLimit') { 
		            const limit = parseInt(interaction.fields.getTextInputValue('newLimitInput')); 
		            if (isNaN(limit) || limit < 0 || limit > 99) return interaction.reply({ content: "❌ Limite inválido.", ephemeral: true }); 
		            await channel.setUserLimit(limit); 
		            return interaction.reply({ content: `✅ Limite definido para ${limit === 0 ? 'ilimitado' : limit}.`, ephemeral: true }); 
		        } 
		        
		        return; 
		    }
	    if (!interaction.isCommand()) return;
	
	    const { commandName, options } = interaction;
	    const reply = (content, ephemeral = true) => {
	        if (typeof content === 'object') return interaction.reply({ ...content, ephemeral });
	        return interaction.reply({ content, ephemeral });
	    };
	
    // Comandos que não devem conceder XP (Admin, Configuração, etc.)
		    const noXpCommands = ['setruleschannel', 'setrankvoid', 'setrankingroles', 'clear', 'setupvoice', 'vcpanel', 'setregister', 'setwelcome', 'setlogchannel', 'antinuke', 'adminpanel', 'autopfp', 'config-loja', 'embed', 'edit-embed'];
		
		    // Adiciona XP para comandos que não estão na lista de exclusão
		    if (!noXpCommands.includes(commandName)) {
		        await addXP(interaction.guild, interaction.user, interaction.channel);
		    }
		    
		    
			    if (commandName === 'xplog') {
			        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
			            return interaction.reply({ content: "❌ Você precisa ser administrador para usar este comando.", ephemeral: true });
			        }
			        const status = options.getString('status');
			        const channel = options.getChannel('canal') || interaction.channel;
			
if (status === 'on') {
				            xpLogConfig.enabled = true;
				            xpLogConfig.channelId = channel.id;
				            saveXPLogConfig();
				            await interaction.reply({ content: `✅ Logs de XP ativados no canal ${channel}!`, ephemeral: true });
				        } else {
				            xpLogConfig.enabled = false;
				            saveXPLogConfig();
				            await interaction.reply({ content: `❌ Logs de XP desativados!`, ephemeral: true });
				        }
			        return;
			    }
			    
    if (commandName === 'auto-mensagem') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Você precisa ser administrador para usar este comando.", ephemeral: true });
        }

        const acao = options.getString('acao');
        const guildId = interaction.guildId;

        if (acao === 'off') {
            if (autoMessageConfig[guildId]) {
                autoMessageConfig[guildId].enabled = false;
                saveAutoMessageConfig();
                if (autoMessageIntervals.has(guildId)) {
                    clearInterval(autoMessageIntervals.get(guildId));
                    autoMessageIntervals.delete(guildId);
                }
                return interaction.reply({ content: "✅ Mensagens automáticas desativadas neste servidor.", ephemeral: true });
            }
            return interaction.reply({ content: "❌ As mensagens automáticas já estão desativadas.", ephemeral: true });
        }

        if (acao === 'status') {
            const config = autoMessageConfig[guildId];
            if (!config || !config.enabled) {
                return interaction.reply({ content: "❌ Mensagens automáticas não estão configuradas ou estão desativadas.", ephemeral: true });
            }
            const embed = new EmbedBuilder()
                .setColor(globalConfig.embedColor)
                .setTitle("📢 Configuração de Auto-Mensagem")
                .addFields(
                    { name: "Canal", value: `<#${config.channelId}>`, inline: true },
                    { name: "Intervalo", value: `${config.interval / 60000} minutos`, inline: true },
                    { name: "Cargo", value: config.roleId ? `<@&${config.roleId}>` : "Nenhum", inline: true },
                    { name: "Mensagem", value: config.message }
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (acao === 'on') {
            const canal = options.getChannel('canal');
            const mensagem = options.getString('mensagem');
            const intervaloMin = options.getInteger('intervalo');
            const cargo = options.getRole('cargo');

            if (!canal || !mensagem || !intervaloMin) {
                return interaction.reply({ content: "❌ Para ativar, você deve fornecer o canal, a mensagem e o intervalo.", ephemeral: true });
            }

            autoMessageConfig[guildId] = {
                enabled: true,
                channelId: canal.id,
                message: mensagem,
                interval: intervaloMin * 60000,
                roleId: cargo ? cargo.id : null,
                lastSent: Date.now() // Define o momento da criação como o último envio inicial
            };

            saveAutoMessageConfig();
            startAutoMessages(guildId);

            return interaction.reply({ content: `✅ Mensagens automáticas configuradas com sucesso! Elas serão enviadas em <#${canal.id}> a cada ${intervaloMin} minutos.`, ephemeral: true });
        }
    }
    if (commandName === 'ping') return reply(`🏓 Latência: ${client.ws.ping}ms`, false);

    if (commandName === 'embed') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Você precisa ser administrador para usar este comando.", ephemeral: true });
        }

        const titulo = options.getString('titulo');
        const descricao = options.getString('descricao');
        const cor = options.getString('cor') || globalConfig.embedColor;
        const imagem = options.getString('imagem');
        const thumbnail = options.getString('thumbnail');
        const rodape = options.getString('rodape');
        const canal = options.getChannel('canal') || interaction.channel;
        const botaoLabel = options.getString('botao_label');
        const botaoLink = options.getString('botao_link');

        if (!titulo && !descricao) {
            return interaction.reply({ content: "❌ Você precisa fornecer pelo menos um título ou uma descrição.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(cor.startsWith('#') ? cor : globalConfig.embedColor);

        if (titulo) embed.setTitle(titulo);
        if (descricao) embed.setDescription(descricao.replace(/\\n/g, '\n').replace(/<br>/g, '\n'));
        if (imagem) embed.setImage(imagem);
        if (thumbnail) embed.setThumbnail(thumbnail);
        if (rodape) embed.setFooter({ text: rodape });

        const components = [];
        if (botaoLabel && botaoLink) {
            try {
                const button = new ButtonBuilder()
                    .setLabel(botaoLabel)
                    .setURL(botaoLink)
                    .setStyle(ButtonStyle.Link);
                components.push(new ActionRowBuilder().addComponents(button));
            } catch (e) {
                return interaction.reply({ content: "❌ O link fornecido para o botão é inválido. Certifique-se de que começa com http:// ou https://", ephemeral: true });
            }
        }

        try {
            await canal.send({ embeds: [embed], components: components });
            return interaction.reply({ content: `✅ Embed enviado com sucesso em ${canal}!`, ephemeral: true });
        } catch (error) {
            console.error("Erro ao enviar embed:", error);
            return interaction.reply({ content: "❌ Ocorreu um erro ao tentar enviar o embed. Verifique se os links de imagem são válidos.", ephemeral: true });
        }
    }

    if (commandName === 'edit-embed') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Você precisa ser administrador para usar este comando.", ephemeral: true });
        }

        const messageId = options.getString('message_id');
        const canal = options.getChannel('canal') || interaction.channel;

        try {
            const targetMessage = await canal.messages.fetch(messageId);
            if (!targetMessage) return interaction.reply({ content: "❌ Mensagem não encontrada.", ephemeral: true });
            if (targetMessage.author.id !== client.user.id) return interaction.reply({ content: "❌ Eu só posso editar mensagens enviadas por mim.", ephemeral: true });
            if (!targetMessage.embeds[0]) return interaction.reply({ content: "❌ Esta mensagem não possui um embed para editar.", ephemeral: true });

            const oldEmbed = targetMessage.embeds[0];
            const newEmbed = EmbedBuilder.from(oldEmbed);

            const titulo = options.getString('titulo');
            const descricao = options.getString('descricao');
            const cor = options.getString('cor');
            const imagem = options.getString('imagem');
            const thumbnail = options.getString('thumbnail');
            const rodape = options.getString('rodape');
            const botaoLabel = options.getString('botao_label');
            const botaoLink = options.getString('botao_link');

            if (titulo !== null) newEmbed.setTitle(titulo);
            if (descricao !== null) newEmbed.setDescription(descricao.replace(/\\n/g, '\n').replace(/<br>/g, '\n'));
            if (cor !== null) newEmbed.setColor(cor.startsWith('#') ? cor : oldEmbed.color);
            
            if (imagem !== null) {
                newEmbed.setImage(imagem === 'remover' ? null : imagem);
            }
            
            if (thumbnail !== null) {
                newEmbed.setThumbnail(thumbnail === 'remover' ? null : thumbnail);
            }
            
            if (rodape !== null) {
                newEmbed.setFooter({ text: rodape === 'remover' ? null : rodape });
            }

            let components = targetMessage.components;
            if (botaoLabel !== null || botaoLink !== null) {
                if (botaoLabel === 'remover' || botaoLink === 'remover') {
                    components = [];
                } else {
                    const currentButton = targetMessage.components[0]?.components[0];
                    const finalLabel = botaoLabel || currentButton?.label;
                    const finalLink = botaoLink || currentButton?.url;

                    if (finalLabel && finalLink) {
                        try {
                            const button = new ButtonBuilder()
                                .setLabel(finalLabel)
                                .setURL(finalLink)
                                .setStyle(ButtonStyle.Link);
                            components = [new ActionRowBuilder().addComponents(button)];
                        } catch (e) {
                            return interaction.reply({ content: "❌ O link fornecido para o botão é inválido.", ephemeral: true });
                        }
                    }
                }
            }

            await targetMessage.edit({ embeds: [newEmbed.toJSON()], components: components });
            return interaction.reply({ content: `✅ Embed editado com sucesso em ${canal}!`, ephemeral: true });
        } catch (error) {
            console.error("Erro ao editar embed:", error);
            return interaction.reply({ content: "❌ Ocorreu um erro ao tentar editar o embed. Verifique o ID da mensagem e o canal.", ephemeral: true });
        }
    }
		    if (commandName === 'rank') { 
            const userXP = xp[interaction.guildId]?.[interaction.user.id] || 0; 
            const level = getLevel(userXP);
            const nextLevelXP = LEVELS[level] || "MAX";
            const progress = nextLevelXP === "MAX" ? 100 : (userXP / nextLevelXP) * 100;
            
            const progressBarLength = 10;
            const filledBlocks = Math.round((progress / 100) * progressBarLength);
            const emptyBlocks = progressBarLength - filledBlocks;
            const progressBar = "▰".repeat(filledBlocks) + "▱".repeat(emptyBlocks);

            const embed = new EmbedBuilder()
                .setColor(globalConfig.embedColor)
                .setAuthor({ name: `Perfil de XP | ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setDescription(`### <a:xp:1320858569037582336> Informações de Nível\nAtualmente você está no **Nível ${level}**.\n\n**Progresso:**\n\`${progressBar}\` **${progress.toFixed(1)}%**\n\n**XP Atual:** \`${userXP}\` / \`${nextLevelXP}\`\n\n### <a:money:1242505304227446794> Cargos de Recompensa\n- **TOP 1:** <@&1434914289143250954>\n- **TOP 2:** <@&1434914684561002506>\n- **TOP 3:** <@&1434914601094348880>\n\n### <a:money:1242505308442595408> Comandos de Economia\n- **/bank** - depósito e saque.\n- **/crash** - aposte seu dinheiro.\n- **/balance** - veja seu saldo.\n- **/daily** - receba uma quantidade de dinheiro diariamente.`)
                .setImage("https://i.imgur.com/lNjOG8B.jpeg")
                .setFooter({ text: "Ranking • Continue interagindo para subir!" })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true }); 
        }
			    if (commandName === 'rankvoid') return reply(leaderboardConfig[interaction.guildId]?.channelId ? `O Rank está em <#${leaderboardConfig[interaction.guildId].channelId}>.` : "O Rank não foi configurado.");
		    if (commandName === 'avatar') { const user = options.getUser('user') || interaction.user; const embed = new EmbedBuilder().setColor(globalConfig.embedColor).setTitle(`🖼️ Avatar de ${user.tag}`).setImage(user.displayAvatarURL({ dynamic: true, size: 1024 })).setColor(globalConfig.embedColor); return interaction.reply({ embeds: [embed], ephemeral: true }); }
		    
				    // === CORREÇÃO DO /help (LENDO DA LISTA LOCAL) ===
				    if (commandName === 'help') { 
				        try {
				            // Agora lê diretamente da variável commandsList definida globalmente ou no escopo acessível
				            const commandsDescription = commandsList.map(cmd => `**/${cmd.name}**\n\`${cmd.description || 'Sem descrição'}\``).join('\n\n');
				            
				            const embed = new EmbedBuilder()
				                .setColor(globalConfig.embedColor)
				                .setTitle("📚 Lista de Comandos")
				                .setDescription(commandsDescription || "Nenhum comando disponível no momento.");
				                
				            return interaction.reply({ embeds: [embed], ephemeral: true });
				        } catch (error) {
				            console.error("Erro ao gerar lista de comandos para o /help:", error);
				            return reply("❌ Ocorreu um erro ao carregar a lista de comandos.");
				        }
				    }
				    // ==========================
		
			    if (commandName === 'apoiador') return interaction.reply(getSupportMessage(interaction.guild));
			
			    if (commandName === 'joinvc') {
			        await handleJoinVC(interaction);
			        return;
			    }
			
			    // === COMANDOS DE ECONOMIA (PARA TODOS) ===
		    switch (commandName) {
		        case 'daily':
		            await handleDaily(interaction);
		            return;
	        case 'balance':
	            await handleBalance(interaction);
	            return;
	        case 'transfer':
	            await handleTransfer(interaction);
	            return;
	        case 'crash':
	            await handleCrash(interaction);
	            return;

	        case 'bank':
	            await handleBank(interaction);
	            return;
	    }
	    // === FIM COMANDOS DE ECONOMIA ===
	
	    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return reply("❌ Você precisa ser administrador para usar este comando.");
	    
			    switch(commandName) {
		        case 'atualizarembedscolor': {
		            const novaCor = options.getString('cor');
		            // Validação simples de HEX
		            if (!/^#[0-9A-F]{6}$/i.test(novaCor)) {
		                return reply("❌ Formato de cor inválido! Use o formato HEX (ex: #000102).");
		            }
		            
		            globalConfig.embedColor = novaCor;
		            saveGlobalConfig();
		            
		            const embed = new EmbedBuilder()
		                .setColor(globalConfig.embedColor)
		                .setTitle("🎨 Cor Atualizada")
		                .setDescription(`A cor de todos os novos embeds foi alterada para \`${novaCor}\`.`);
		                
		            return interaction.reply({ embeds: [embed], ephemeral: true });
		        }
		        case 'autopfp': {
	            const action = options.getString('action');
	            const channel = options.getChannel('channel');
	
	            if (action === 'start') {
	                if (!channel || !channel.isTextBased()) return reply("❌ Para iniciar, você deve fornecer um canal de texto válido.");
	                
	                // Cria a pasta se não existir (para o usuário colocar as imagens)
	                const folderPath = path.join(process.cwd(), IMAGE_FOLDER); // Caminho absoluto para a pasta
	                if (!fs.existsSync(folderPath)) {
	                    fs.mkdirSync(folderPath);
	                    return reply(`✅ Pasta de imagens **${IMAGE_FOLDER}** criada. Coloque suas imagens lá e execute o comando novamente. (Caminho: \`${folderPath}\`)`);
	                }
	                
	                // Verifica se há imagens
	                const allFiles = fs.readdirSync(folderPath).filter(file => /\.(jpe?g|png|gif)$/i.test(file));
	                if (allFiles.length === 0) return reply(`❌ Nenhuma imagem encontrada na pasta **${IMAGE_FOLDER}**. Adicione imagens e tente novamente.`);
	                
	                // Salva a configuração e inicia o loop
	                autopfpConfig[interaction.guildId] = { enabled: true, channelId: channel.id };
	                saveAutoPfpConfig();
	                startAutoPfpLoop(interaction.guildId);
	                
	                return reply(`✅ AutoPFP iniciado! Enviando 3 imagens em ordem sequencial a cada 5 minutos em ${channel}.`);
	            }
	
	            if (action === 'stop') {
	                if (stopAutoPfpLoop(interaction.guildId)) {
	                    autopfpConfig[interaction.guildId] = { enabled: false, channelId: autopfpConfig[interaction.guildId]?.channelId };
	                    saveAutoPfpConfig();
	                    return reply("✅ AutoPFP parado com sucesso.");
	                } else {
	                    return reply("❌ O AutoPFP não estava ativo neste servidor.");
	                }
	            }
	            return reply("❌ Ação inválida. Use 'start' ou 'stop'.");
	        }
	        case 'clear': await interaction.channel.bulkDelete(options.getInteger('amount'), true).catch(() => {}); return reply(`✅ Mensagens apagadas.`);

		            
				            case 'setruleschannel': {
                                await handleSetRulesChannel(interaction);
                                break;
                            }
				            case 'setrankingroles': {
			                const role1 = options.getRole('top1_role');
			                const role2 = options.getRole('top2_role');
			                const role3 = options.getRole('top3_role');

			                if (!role1 || !role2 || !role3) return reply("❌ Por favor, forneça os 3 cargos (Top 1, Top 2, Top 3).");

			                rankingRolesConfig[interaction.guildId] = {
			                    roleId1: role1.id,
			                    roleId2: role2.id,
			                    roleId3: role3.id,
			                    currentTopUsers: {} // Resetar o registro de usuários atuais
			                };
			                saveRankingRolesConfig();

			                // Tenta aplicar os cargos imediatamente
			                await updateRankingRoles(interaction.guild);

			                return reply(`✅ Cargos de Ranking configurados! Top 1: ${role1}, Top 2: ${role2}, Top 3: ${role3}. Os cargos serão atualizados a cada 5 minutos.`);
			            }
				            case 'setrankvoid': { const channel = options.getChannel('channel'); if (!channel.isTextBased()) return reply("❌ O canal deve ser de texto."); await interaction.deferReply({ ephemeral: true }); try { const lbData = await getLeaderboardEmbed(interaction.guild); const message = await channel.send({ embeds: lbData.embeds, components: lbData.components }); leaderboardConfig[interaction.guildId] = { channelId: channel.id, messageId: message.id }; saveLeaderboardConfig(); return interaction.editReply(`✅ Rank configurado em ${channel}.`); } catch (e) { return interaction.editReply("❌ Erro. Verifique minhas permissões no canal."); } }
	        case 'setupvoice': { const channel = options.getChannel('channel'); const category = options.getChannel('category'); if (channel.type !== 2) return reply("❌ O canal de criação deve ser de voz."); if (category.type !== 4) return reply("❌ A categoria deve ser uma categoria."); voiceConfig[interaction.guildId] = { categoryId: category.id, createChannelId: channel.id }; saveVoiceConfig(); return reply(`✅ Sistema de voz temporária configurado!`); }
	        case 'adminpanel': {
	            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return reply("❌ Apenas administradores podem configurar o painel estático.");
	            
	            const embed = new EmbedBuilder()
	                .setTitle("<a:_dev1:1329746208553701376> Centro de Comando de Moderação")
	                .setDescription("Bem-vindo ao painel de moderação oficial. Este painel é uma ferramenta estática para a equipe de staff gerenciar membros com rapidez e eficiência.\n\n**Como usar:**\n1. Clique no botão da ação desejada.\n2. Uma janela (modal) será aberta para você inserir o ID do membro e o motivo.\n3. A ação será executada e registrada nos logs.")
		                .addFields(
		                    { name: "🔨 Punições Pesadas", value: "Banimentos e Expulsões permanentes ou temporárias.", inline: false },
		                    { name: "⏱️ Controle de Comportamento", value: "Castigos (Timeout), Mutes de voz e Avisos.", inline: false }
		                )
	                .setColor(globalConfig.embedColor)
	                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
		                .setImage("https://i.imgur.com/lNjOG8B.jpeg") // Banner decorativo
	                .setFooter({ text: `Painel de Moderação • ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() })
	                .setTimestamp();
	            
	            const row1 = new ActionRowBuilder().addComponents(
	                new ButtonBuilder().setCustomId('admin_ban').setLabel('Banir').setStyle(ButtonStyle.Danger).setEmoji('🔨'),
	                new ButtonBuilder().setCustomId('admin_kick').setLabel('Expulsar').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
	                new ButtonBuilder().setCustomId('admin_timeout').setLabel('Castigar').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
	                new ButtonBuilder().setCustomId('admin_mute').setLabel('Mutar Voz').setStyle(ButtonStyle.Secondary).setEmoji('🔇')
	            );

	            const row2 = new ActionRowBuilder().addComponents(
	                new ButtonBuilder().setCustomId('admin_warn').setLabel('Avisar').setStyle(ButtonStyle.Primary).setEmoji('⚠️')
	            );

	            await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
	            return reply("✅ Painel de moderação estático enviado com sucesso!", true);
	        }
	
	        case 'vcpanel': {
	            const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
	                .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() })
	                .setTitle("Menu do Gerenciador de Voz")
	                .setDescription("Bem-vindo à interface do Gerenciador de Voz! Aqui você pode gerenciar seus canais de voz com facilidade. Abaixo estão as opções disponíveis.")
	                .addFields(
	                    { name: "Trancar", value: "Tranca seu canal de voz.", inline: true },
	                    { name: "Destrancar", value: "Destranca seu canal de voz.", inline: true },
	                    { name: "Ocultar", value: "Oculta seu canal de voz.", inline: true },
	                    { name: "Revelar", value: "Revela seu canal de voz oculto.", inline: true },
	                    { name: "Renomear", value: "Renomeia seu canal de voz.", inline: true },
	                    { name: "Reivindicar", value: "Reivindica um canal de voz sem dono.", inline: true },
	                    { name: "Aumentar", value: "Aumenta o limite de usuários.", inline: true },
	                    { name: "Diminuir", value: "Diminui o limite de usuários.", inline: true },
	                    { name: "Expulsar", value: "Expulsa um usuário do seu canal.", inline: true },
	                    { name: "Deletar", value: "Deleta seu canal de voz.", inline: true },
	
	                )
	                .setThumbnail(client.user.displayAvatarURL());
	            const row1 = new ActionRowBuilder().addComponents(
	                new ButtonBuilder().setCustomId('vcLock').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcUnlock').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcHide').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcReveal').setEmoji('📢').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcRename').setEmoji('✏️').setStyle(ButtonStyle.Secondary)
	            );
	            const row2 = new ActionRowBuilder().addComponents(
	                new ButtonBuilder().setCustomId('vcClaim').setEmoji('👑').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcIncrease').setEmoji('➕').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcDecrease').setEmoji('➖').setStyle(ButtonStyle.Secondary),
	                new ButtonBuilder().setCustomId('vcKick').setEmoji('🚫').setStyle(ButtonStyle.Secondary)
	            );
	            await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
	            return reply("✅ Painel de controle de voz enviado!");
	        }
	        case 'setregister': { const channel = options.getChannel('channel'); const role = options.getRole('role'); const gifUrl = options.getString('gif_url'); if (!channel.isTextBased()) return reply("❌ O canal deve ser de texto."); const description = `Clique no botão para receber o cargo **${role.name}** e acessar o servidor.`; const embed = new EmbedBuilder().setColor(globalConfig.embedColor).setTitle("🚨 Verificação").setDescription(description).setColor(globalConfig.embedColor); if (gifUrl) embed.setImage(gifUrl); const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`register_${role.id}`).setLabel('Verificar').setStyle(ButtonStyle.Success)); await channel.send({ embeds: [embed], components: [row] }).then(() => reply(`✅ Mensagem de registro enviada.`)).catch(() => reply("❌ Erro ao enviar a mensagem.")); return; }
	        case 'setwelcome': case 'setlogchannel': { const channel = options.getChannel('channel'); if (!channel.isTextBased()) return reply("❌ O canal deve ser de texto."); const config = commandName === 'setwelcome' ? welcomeConfig : logConfig; const key = commandName === 'setwelcome' ? 'welcomeChannelId' : 'channelId'; config[interaction.guildId] = { [key]: channel.id }; commandName === 'setwelcome' ? saveWelcomeConfig() : saveLogConfig(); return reply(`✅ Canal de ${commandName === 'setwelcome' ? 'boas-vindas' : 'logs'} configurado para ${channel}.`); }
case 'antinuke': { if (!antinukeConfig[interaction.guildId]) antinukeConfig[interaction.guildId] = { enabled: false, maxDeletes: 3, timeWindow: 10 }; antinukeConfig[interaction.guildId].enabled = options.getString('action') === 'enable'; saveAntinukeConfig(); return reply(`✅ Sistema Antinuke **${options.getString('action') === 'enable' ? 'ATIVADO' : 'DESATIVADO'}**.`); }
				        case 'config-loja':
				        case 'editar-loja':
				        case 'editar-item':
				        case 'atualizar-loja': {
				            const isEdit = commandName === 'editar-loja';
				            const isEditItem = commandName === 'editar-item';
				            const isUpdate = commandName === 'atualizar-loja';
				            const messageId = (isEdit || isEditItem || isUpdate) ? options.getString('message_id') : null;
				            
				            let currentShop = (isEdit || isEditItem || isUpdate) ? (shopConfig[messageId] || Object.values(shopConfig).find(s => s.messageId === messageId)) : null;
				            
				            if ((isEdit || isEditItem || isUpdate) && !currentShop) {
				                return reply("❌ Não encontrei dados salvos para esta loja. Verifique o ID da mensagem.");
				            }
	
					            let newBanner = currentShop ? currentShop.banner : options.getString('banner');
						            let newTitle = currentShop ? currentShop.title : `<a:dollar39:1465353629849354556> Loja do Servidor | ${interaction.guild.name}`;
						            let newDescription = currentShop ? currentShop.description : "Adquira cargos exclusivos utilizando seu saldo bancário!\n\n";
						            let finalItems = currentShop ? JSON.parse(JSON.stringify(currentShop.items)) : [];
		
						            if (commandName === 'config-loja') {
						                newBanner = options.getString('banner');
						                finalItems = [];
						                for (let i = 1; i <= 10; i++) {
						                    const role = options.getRole(`cargo${i}`);
						                    const price = options.getNumber(`preco${i}`);
						                    if (role && price) {
						                        finalItems.push({ roleId: role.id, roleName: role.name, price: price, emoji: '<a:money:1242505308442595408>' });
						                    }
						                }
						            } else if (isEdit) {
					                const bannerOpt = options.getString('banner');
					                const titleOpt = options.getString('titulo');
					                const descOpt = options.getString('descricao');
					                if (bannerOpt) newBanner = bannerOpt;
					                if (titleOpt) newTitle = titleOpt;
					                if (descOpt) newDescription = descOpt;
					            } else if (isEditItem) {
				                const itemIndex = options.getInteger('item_numero') - 1;
				                const role = options.getRole('cargo');
				                const price = options.getNumber('preco');
				                const emoji = options.getString('emoji');
				                
				                if (!finalItems[itemIndex]) {
				                    if (!role || !price) return reply(`❌ O item #${itemIndex + 1} não existe nesta loja. Para criar um novo item, você deve fornecer pelo menos o cargo e o preço.`);
				                    finalItems[itemIndex] = { roleId: role.id, roleName: role.name, price: price, emoji: emoji || '<a:money:1242505308442595408>' };
				                } else {
				                    if (role) { finalItems[itemIndex].roleId = role.id; finalItems[itemIndex].roleName = role.name; }
				                    if (price) finalItems[itemIndex].price = price;
				                    if (emoji) finalItems[itemIndex].emoji = emoji;
				                }
				            }
				            
				            if (finalItems.length === 0) return reply("❌ A loja precisa ter pelo menos um cargo.");
	
				            const embed = new EmbedBuilder()
				                .setColor(globalConfig.embedColor)
				                .setTitle(newTitle)
				                .setDescription(newDescription)
				                .setImage(newBanner)
				                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
				                .setTimestamp();
				            
				            const selectMenu = new StringSelectMenuBuilder()
				                .setCustomId('shop_buy_menu')
				                .setPlaceholder('Selecione um cargo para comprar...');
		
				            const leftColumn = finalItems.slice(0, 5);
				            const rightColumn = finalItems.slice(5, 10);
				            
				            let leftColumnText = "";
				            leftColumn.forEach(item => {
				                const itemEmoji = item.emoji || '<a:money:1242505308442595408>';
				                leftColumnText += `${itemEmoji} <@&${item.roleId}>\n└ **Preço:** \`${formatDollars(item.price)}\`\n\n`;
				            });
				            
				            let rightColumnText = "";
				            rightColumn.forEach(item => {
				                const itemEmoji = item.emoji || '<a:money:1242505308442595408>';
				                rightColumnText += `${itemEmoji} <@&${item.roleId}>\n└ **Preço:** \`${formatDollars(item.price)}\`\n\n`;
				            });
				            
				            finalItems.forEach(item => {
				                selectMenu.addOptions({
				                    label: `Comprar ${item.roleName}`,
				                    description: `Preço: ${formatDollars(item.price)}`,
				                    value: item.roleId,
				                    emoji: item.emoji || '<a:money:1242505308442595408>'
				                });
				            });
	
				            if (leftColumnText) embed.addFields({ name: "<a:dollar39:1465353629849354556> Cargos Disponíveis", value: leftColumnText, inline: true });
				            if (rightColumnText) embed.addFields({ name: "<a:dollar39:1465353629849354556> Mais Opções", value: rightColumnText, inline: true });
		
				            const row = new ActionRowBuilder().addComponents(selectMenu);
				            
				            if (isEdit || isEditItem || isUpdate) {
				                try {
				                    const message = await interaction.channel.messages.fetch(messageId);
				                    await message.edit({ embeds: [embed], components: [row] });
				                    shopConfig[messageId] = { banner: newBanner, title: newTitle, description: newDescription, items: finalItems, messageId: messageId };
				                    saveShopConfig();
				                    return reply(`✅ Loja ${isEdit ? 'editada' : isEditItem ? 'item editado' : 'atualizada'} com sucesso!`);
				                } catch (e) {
				                    console.error(e);
				                    return reply("❌ Não foi possível encontrar ou editar a mensagem. Verifique o ID.");
				                }
					            } else {
				                const sentMessage = await interaction.channel.send({ embeds: [embed], components: [row] });
				                shopConfig[sentMessage.id] = { banner: newBanner, title: newTitle, description: newDescription, items: finalItems, messageId: sentMessage.id };
				                saveShopConfig();
					            return reply(`✅ Loja enviada com sucesso! ID: \`${sentMessage.id}\``);
					            }
					            return;
					        }
					        case 'filtro': {
					            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return reply("❌ Você precisa ser administrador.");
					            
					            const acao = options.getString('acao');
					            const palavra = options.getString('palavra');
					            const guildId = interaction.guildId;
					            
					            if (!wordFilterConfig[guildId]) wordFilterConfig[guildId] = { words: [] };
					            
					            if (acao === 'add') {
					                if (!palavra) return reply("❌ Você precisa especificar uma palavra.");
					                if (wordFilterConfig[guildId].words.includes(palavra.toLowerCase())) return reply("❌ Esta palavra já está no filtro.");
					                
					                wordFilterConfig[guildId].words.push(palavra.toLowerCase());
					                saveWordFilterConfig();
					                return reply(`✅ Palavra \`${palavra}\` adicionada ao filtro.`);
					            } else if (acao === 'remove') {
					                if (!palavra) return reply("❌ Você precisa especificar uma palavra.");
					                const index = wordFilterConfig[guildId].words.indexOf(palavra.toLowerCase());
					                if (index === -1) return reply("❌ Esta palavra não está no filtro.");
					                
					                wordFilterConfig[guildId].words.splice(index, 1);
					                saveWordFilterConfig();
					                return reply(`✅ Palavra \`${palavra}\` removida do filtro.`);
					            } else if (acao === 'list') {
					                const words = wordFilterConfig[guildId].words;
					                if (words.length === 0) return reply("ℹ️ Não há palavras no filtro deste servidor.");
					                
					                const embed = new EmbedBuilder()
					                    .setTitle("🚫 Palavras Filtradas")
					                    .setColor(globalConfig.embedColor)
					                    .setDescription(words.map(w => `• ${w}`).join('\n'))
					                    .setTimestamp();
					                
					                return reply({ embeds: [embed] });
					            }
					            return;
					        }
				    }
				});
	
	// === OUTROS EVENTOS ===
	client.on('guildCreate', async guild => { const channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)); if (channel) await channel.send(getSupportMessage(guild)).catch(() => {}); });
		client.on('messageCreate', async message => {
		    if (message.author.bot || !message.guild) return;

		    // === FILTRO DE PALAVRAS ===
		    const guildId = message.guild.id;
		    if (wordFilterConfig[guildId] && wordFilterConfig[guildId].words && wordFilterConfig[guildId].words.length > 0) {
		        const content = message.content.toLowerCase();
		        const hasBlockedWord = wordFilterConfig[guildId].words.some(word => content.includes(word.toLowerCase()));
		        
		        if (hasBlockedWord) {
		            // Deleta a mensagem
		            message.delete().catch(() => {});
		            
		            // Envia aviso efêmero (como não é interação, usamos uma mensagem que se auto-deleta ou apenas ignoramos se não quiser log)
		            // Para ser "só a pessoa consiga ver" em messageCreate, o ideal é enviar uma DM ou uma mensagem no canal e deletar rápido.
		            // Como você pediu "que só aquela pessoa consiga ver", vou enviar uma DM.
		            const embed = new EmbedBuilder()
		                .setColor("#FF0000")
		                .setTitle("⚠️ Mensagem Bloqueada")
		                .setDescription(`Sua mensagem no servidor **${message.guild.name}** continha palavras proibidas e foi removida.`)
		                .setTimestamp();
		            
		            return message.author.send({ embeds: [embed] }).catch(() => {
		                // Se a DM estiver fechada, envia no canal e deleta em 5s
		                message.channel.send(`${message.author}, sua mensagem continha palavras proibidas e foi removida.`).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
		            });
		        }
		    }
		
		    // === TRATAMENTO DE COMANDOS DE PREFIXO ===
	    const prefix = '!';
	    if (message.content.startsWith(prefix)) {
	        const args = message.content.slice(prefix.length).trim().split(/ +/);
	        const command = args.shift().toLowerCase();
	
	        // Comando !dp (Dar Dinheiro) - SÓ PARA ADMIN
	        if (command === 'dp') {
	            // 1. Verificação de Permissão de Administrador
	            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	                // Resposta temporária (ephemeral) não é possível em comandos de prefixo,
	                // então vamos deletar a mensagem de erro após um tempo.
	                return message.reply("❌ Você precisa ser administrador para usar este comando.").then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	
	            // 2. Verificação de Argumentos: !dp <@usuário> <quantia>
	            const targetUser = message.mentions.users.first();
	            const amount = parseInt(args[1]);
	
	            if (!targetUser || isNaN(amount) || amount <= 0) {
	                return message.reply(`Uso correto: \`${prefix}dp <@usuário> <quantia>\` (A quantia deve ser um número inteiro positivo).`)
	                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	            
	            // 3. Execução do Comando
	            const userEconomy = getUser(targetUser.id, targetUser.tag);
	            userEconomy.bank += amount; // Adiciona ao banco, como é o padrão do seu sistema
	            updateUser(targetUser.id, userEconomy);
	
	            // 4. Resposta Temporária (Deletar a mensagem de comando e a resposta)
	            const replyMessage = `✅ **${formatDollars(amount)}** adicionados ao banco de **${targetUser.tag}** (por ${message.author.tag}).`;
	            
	            // Deleta a mensagem de comando do usuário
	            message.delete().catch(() => {}); 
	
	            // Envia a resposta e deleta após 5 segundos
	            return message.channel.send(replyMessage)
	                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	        }
	
	        // Comando !rm (Remover/Zerar Dinheiro) - SÓ PARA ADMIN
	        if (command === 'rm') {
	            // 1. Verificação de Permissão de Administrador
	            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	                return message.reply("❌ Você precisa ser administrador para usar este comando.").then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	
	            // 2. Verificação de Argumentos: !rm <@usuário> [quantia | "all"]
	            const targetUser = message.mentions.users.first();
	            const amountOrAll = args[1]?.toLowerCase();
	            let amount = 0;
	            let actionText = '';
	
	            if (!targetUser) {
	                return message.reply(`Uso correto: \`${prefix}rm <@usuário> [quantia | "all"]\`.`)
	                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	            
	            const userEconomy = getUser(targetUser.id, targetUser.tag);
	
	            if (amountOrAll === 'all') {
	                amount = userEconomy.bank; // Remove todo o dinheiro do banco
	                userEconomy.bank = 0;
	                actionText = 'removido todo o saldo ($' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ')';
	            } else {
	                amount = parseInt(amountOrAll);
	
	                if (isNaN(amount) || amount <= 0) {
	                    return message.reply(`Uso correto: \`${prefix}rm <@usuário> [quantia | "all"]\` (A quantia deve ser um número inteiro positivo ou "all").`)
	                        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	                }
	
	                // Garante que o saldo não fique negativo
	                if (userEconomy.bank < amount) {
	                    amount = userEconomy.bank;
	                    userEconomy.bank = 0;
	                    actionText = `removido o saldo restante ($${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
	                } else {
	                    userEconomy.bank -= amount;
	                    actionText = `removido **${formatDollars(amount)}**`;
	                }
	            }
	            
	            // 3. Execução do Comando
	            updateUser(targetUser.id, userEconomy);
	
	            // 4. Resposta Temporária (Deletar a mensagem de comando e a resposta)
	            const replyMessage = `✅ Saldo de **${targetUser.tag}** (${actionText}) com sucesso (por ${message.author.tag}). Novo saldo: **${formatDollars(userEconomy.bank)}**.`;
	            
	            // Deleta a mensagem de comando do usuário
	            message.delete().catch(() => {}); 
	
	            // Envia a resposta e deleta após 5 segundos
	            return message.channel.send(replyMessage)
	                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	        }

        // Comando !setlevel (Definir Nível) - SÓ PARA ADMIN
        if (command === "setlevel") {
            // 1. Verificação de Permissão de Administrador
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply("❌ Você precisa ser administrador para usar este comando.")
                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
            }

            // 2. Verificação de Argumentos: !setlevel <@usuário> <nível>
            const targetUser = message.mentions.users.first();
            const level = parseInt(args[1]);

            if (!targetUser || isNaN(level) || level < 0) {
                return message.reply(`Uso correto: ${prefix}setlevel <@usuário> <nível> (O nível deve ser um número positivo).`)
                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
            }

            // 3. Execução do Comando
            const guildId = message.guild.id;
            const userId = targetUser.id;

            if (!xp[guildId]) xp[guildId] = {};

            // Define o XP necessário para o nível escolhido
            // Se level for 0, XP é 0. Se for > 0, pega o valor do array LEVELS[level-1]
            const newXP = level === 0 ? 0 : LEVELS[level - 1];
            
            xp[guildId][userId] = newXP;
            saveXP();

            // 4. Resposta Temporária
            const replyMessage = `✅ O nível de **${targetUser.tag}** foi definido para **${level}** (XP ajustado para ${newXP}).`;
            
            message.delete().catch(() => {}); 

            return message.channel.send(replyMessage)
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
        }
	        if (command === 'dp') {
	            // 1. Verificação de Permissão de Administrador
	            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
	                // Resposta temporária (ephemeral) não é possível em comandos de prefixo,
	                // então vamos deletar a mensagem de erro após um tempo.
	                return message.reply("❌ Você precisa ser administrador para usar este comando.").then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	
	            // 2. Verificação de Argumentos: !dp <@usuário> <quantia>
	            const targetUser = message.mentions.users.first();
	            const amount = parseInt(args[1]);
	
	            if (!targetUser || isNaN(amount) || amount <= 0) {
	                return message.reply(`Uso correto: \`${prefix}dp <@usuário> <quantia>\` (A quantia deve ser um número inteiro positivo).`)
	                    .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	            }
	            
	            // 3. Execução do Comando
	            const userEconomy = getUser(targetUser.id, targetUser.tag);
	            userEconomy.bank += amount; // Adiciona ao banco, como é o padrão do seu sistema
	            updateUser(targetUser.id, userEconomy);
	
	            // 4. Resposta Temporária (Deletar a mensagem de comando e a resposta)
	            const replyMessage = `✅ **${formatDollars(amount)}** adicionados ao banco de **${targetUser.tag}** (por ${message.author.tag}).`;
	            
	            // Deleta a mensagem de comando do usuário
	            message.delete().catch(() => {}); 
	
	            // Envia a resposta e deleta após 5 segundos
	            return message.channel.send(replyMessage)
	                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000)).catch(() => {});
	        }
	    }
	    // === FIM TRATAMENTO DE COMANDOS DE PREFIXO ===
	
		    // Lógica de XP (já existente)
		    // Reutilizando a função addXP para manter a lógica centralizada
		    await addXP(message.guild, message.author, message.channel);
		});
	client.on('guildMemberAdd', async member => {
    const config = welcomeConfig[member.guild.id];
    if (!config?.welcomeChannelId) return;
    try {
        const channel = await member.guild.channels.fetch(config.welcomeChannelId);
        if (channel?.isTextBased()) {
            const embed = new EmbedBuilder()
                .setColor(globalConfig.embedColor)
                .setTitle(`Bem-vindo(a) ao Void <:0knife:1419332665949032600>!`)
                .setDescription(`Wsp ${member}.\nTemos agora ${member.guild.memberCount} membros.\n\nNão se esqueça de ler as regras!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
                .setImage('https://i.imgur.com/iPRDWR1.gif')
                .setFooter({ text: `Usuário: ${member.user.tag} | ID: ${member.id}` })
                .setTimestamp();
            await channel.send({ content: `👋 Olá, ${member}!`, embeds: [embed] });
        }
    } catch (e) {
        console.error("Erro ao enviar mensagem de boas-vindas:", e);
    }
});
			client.on('voiceStateUpdate', async (oldState, newState) => {
			    const { guild, member } = newState;
			    if (!member || member.user.bot) return; // Ignora bots
			    
			    const userId = member.id;
			    const guildId = guild.id;
			
			    // Lógica de Voz Temporária (existente)
			    const config = voiceConfig[guildId];
			    if (config) {
			        const { categoryId, createChannelId } = config;
			
			        if (newState.channelId === createChannelId) {
			            try {
			                const channel = await guild.channels.create({ name: `Sala de ${member.user.username}`, type: 2, parent: categoryId, permissionOverwrites: [{ id: member.id, allow: [PermissionsBitField.Flags.ManageChannels] }] });
			                await member.voice.setChannel(channel);
			                tempVcOwners.set(channel.id, member.id);
			                await sendLog(guild, new EmbedBuilder().setColor(globalConfig.embedColor).setTitle("🎤 Nova Sala Temporária").setColor(globalConfig.embedColor).setDescription(`### 🏠 Sala Criada

> **Dono:** ${member}
> **Canal:** ${channel.name}

O canal foi criado com sucesso e as permissões foram configuradas.`).setThumbnail(member.user.displayAvatarURL({ dynamic: true })));
			            } catch (e) { console.error("Erro ao criar canal de voz:", e); }
			        }
			
			        if (oldState.channel?.parentId === categoryId && oldState.channel.id !== createChannelId && oldState.channel.members.size === 0) {
			            try {
			                await oldState.channel.delete('Canal temporário vazio.');
			                tempVcOwners.delete(oldState.channel.id);
			                await sendLog(guild, new EmbedBuilder().setColor(globalConfig.embedColor).setTitle("🗑️ Canal Excluído").setColor(globalConfig.embedColor).setDescription(`**Canal:** ${oldState.channel.name}`));
			            } catch (e) {}
			        }
			    }
			
				    // Lógica de Recompensa de Voz (Rastreamento) - Ignora Mute/Deaf
				    if (newState.channelId) {
				        // Entrou ou está em um canal
				        if (!voiceXP[userId]) voiceXP[userId] = {};
				        if (!voiceXP[userId][guildId]) voiceXP[userId][guildId] = {};
				
				        // Inicia o rastreamento se ainda não estiver rastreando (ignora mute/deaf)
				        if (!voiceXP[userId][guildId][newState.channelId]) {
				            voiceXP[userId][guildId][newState.channelId] = Date.now();
				        }
				    } else if (oldState.channelId) {
				        // Saiu de um canal
				        if (voiceXP[userId] && voiceXP[userId][guildId] && voiceXP[userId][guildId][oldState.channelId]) {
				            delete voiceXP[userId][guildId][oldState.channelId];
				        }
				    }
			
			    // Limpeza de objetos vazios
			    if (voiceXP[userId] && Object.keys(voiceXP[userId][guildId] || {}).length === 0) {
			        delete voiceXP[userId][guildId];
			    }
			    if (voiceXP[userId] && Object.keys(voiceXP[userId]).length === 0) {
			        delete voiceXP[userId];
			    }
			});
	
	async function handleAntinuke(actionType, target) { if (!antinukeConfig[target.guild.id]?.enabled) return; try { const auditLogs = await target.guild.fetchAuditLogs({ type: actionType, limit: 1 }); const log = auditLogs.entries.first(); if (!log || log.target.id !== target.id || log.executor.id === client.user.id || log.executor.bot) return; const antinukeActions = {}; const guildActions = antinukeActions[target.guild.id] = antinukeActions[target.guild.id] || {}; const userActions = guildActions[log.executor.id] = guildActions[log.executor.id] || {}; const actionList = userActions[actionType] = userActions[actionType] || []; const now = Date.now(); actionList.push(now); const recentActions = actionList.filter(ts => now - ts < 10000); userActions[actionType] = recentActions; if (recentActions.length >= (antinukeConfig[target.guild.id].maxDeletes || 3)) { const memberToBan = await target.guild.members.fetch(log.executor.id); if (memberToBan?.bannable) { await memberToBan.ban({ reason: `Antinuke: Limite de ações suspeitas excedido.` }); console.log(`✅ Antinuke: Usuário ${log.executor.tag} banido.`); } } } catch (e) {} }
	client.on('channelDelete', async (channel) => handleAntinuke(12, channel));
	client.on('roleDelete', async (role) => handleAntinuke(32, role));
	
	// === LOGIN ===
	// === HANDLER DE COMANDOS DE VOZ ===

async function handleJoinVC(interaction) {
    // Verifica se o usuário está em um canal de voz
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: "❌ Você precisa estar em um canal de voz para usar este comando.", ephemeral: true });
    }

    // Verifica permissões do bot
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
        return interaction.reply({ content: `❌ Não tenho permissão para **Conectar** e **Falar** no canal de voz \`${voiceChannel.name}\`.`, ephemeral: true });
    }

    try {
        // Conecta ao canal de voz
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true, // O bot fica "mutado" para si mesmo, mas permanece no canal
            selfMute: false, // O bot não precisa falar, mas o Discord pode desconectar bots que ficam self-muted por muito tempo.
        });

        // O bot permanecerá conectado indefinidamente, conforme solicitado.
        // Nota: O bot pode ser desconectado por eventos do Discord ou do servidor.

        const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
            .setColor(globalConfig.embedColor)
            .setTitle("✅ Conectado ao Canal de Voz")
            .setDescription(`Conectei-me ao canal **${voiceChannel.name}** e permanecerei aqui indefinidamente.`)
            .setFooter({ text: "O bot não irá reproduzir áudio." });

        return interaction.reply({ embeds: [embed], ephemeral: false });

    } catch (error) {
        console.error("Erro ao conectar ao canal de voz:", error);
        return interaction.reply({ content: "❌ Ocorreu um erro ao tentar conectar ao canal de voz.", ephemeral: true });
    }
}

client.login(process.env.TOKEN);

// === INICIALIZAÇÃO DE INTERVALOS ===
// O evento ready já lida com a inicialização dos sistemas.
	
	// === NOVAS FUNÇÕES DE BANCO ===
	
	async function handleBank(interaction) {
	    const userId = interaction.user.id;
	    const user = getUser(userId, interaction.user.tag);
	
	    const embed = new EmbedBuilder().setColor(globalConfig.embedColor)
	        .setColor(globalConfig.embedColor)
	        .setTitle(`🏦 Banco de ${interaction.user.tag}`)
	        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
	        .setDescription("Use os botões para depositar ou sacar.")
	        .addFields(
	            { name: '<a:richxp:1464679900500988150> Carteira (Wallet)', value: formatDollars(user.wallet), inline: true },
	            { name: '🏦 Banco (Bank)', value: formatDollars(user.bank), inline: true }
	        );
	
	    const row = new ActionRowBuilder()
	        .addComponents(
	            new ButtonBuilder()
	                .setCustomId('bank_deposit')
	                .setLabel('Depositar')
	                .setStyle(ButtonStyle.Success)
	                .setEmoji('📥'),
	            new ButtonBuilder()
	                .setCustomId('bank_withdraw')
	                .setLabel('Sacar')
	                .setStyle(ButtonStyle.Primary)
	                .setEmoji('📤')
	        );
	
	    await interaction.reply({ content: `${interaction.user}`, embeds: [embed], components: [row], ephemeral: true });
	}
	
	async function handleDeposit(interaction) {
	    const modal = new ModalBuilder()
	        .setCustomId('modal_deposit')
	        .setTitle('Depositar')
	        .addComponents(
	            new ActionRowBuilder().addComponents(
	                new TextInputBuilder()
	                    .setCustomId('deposit_amount')
	                    .setLabel('Quantidade a depositar (ou "all")')
	                    .setStyle(TextInputStyle.Short)
	                    .setRequired(true)
	            )
	        );
	    await interaction.showModal(modal);
	}
	
	async function handleWithdraw(interaction) {
	    const modal = new ModalBuilder()
	        .setCustomId('modal_withdraw')
	        .setTitle('Sacar')
	        .addComponents(
	            new ActionRowBuilder().addComponents(
	                new TextInputBuilder()
	                    .setCustomId('withdraw_amount')
	                    .setLabel('Quantidade a sacar (ou "all")')
	                    .setStyle(TextInputStyle.Short)
	                    .setRequired(true)
	            )
	        );
	    await interaction.showModal(modal);
	}


