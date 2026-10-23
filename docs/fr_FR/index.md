# RPi Dash

Plugin Jeedom qui transforme un Raspberry Pi avec écran (tactile ou non) en tableau de bord :
affichage de l'état des équipements et pilotage de leurs commandes (boutons, interrupteurs,
curseurs, couleurs, listes, messages).

## Installation du plugin

1. Dans Jeedom : **Réglages > Système > Configuration > onglet Mises à jour/Market**, activez la source **GitHub**.
2. **Plugins > Gestion des plugins > Ajouter un plugin (+)** :
   - Type de source : **GitHub**
   - ID logique du plugin : `rpidash`
   - Utilisateur ou organisation : `matheobl86`
   - Nom du dépôt : `Plugin-jeedom`
   - Branche : `master`
3. Activez le plugin.
4. Vérifiez dans **Réglages > Système > Configuration > API** que l'accès API du plugin *RPi Dash* est **activé**.

## Créer un écran

**Plugins > Organisation > RPi Dash > Ajouter un écran**. Chaque équipement du plugin correspond à un écran.

### Onglet « Écran »

| Paramètre | Description |
|---|---|
| Taille de l'écran | *Automatique* (prend toute la fenêtre) ou une taille fixe : 480×320 (3,5"), 800×480 (écran officiel 7"), 1024×600, 1280×720, 1280×800, 1920×1080 ou **Personnalisée** (largeur et hauteur libres). |
| Orientation | Paysage ou portrait (la largeur et la hauteur sont inversées automatiquement). |
| Colonnes | Nombre de tuiles par ligne. `0` = calculé selon la largeur. |
| Thème | Sombre ou clair. |
| Rafraîchissement | Intervalle de mise à jour des états, en secondes (1 à 60). |
| Bandeau | Afficher l'horloge et les onglets par pièce. |

Avec une taille fixe, ouvrir le lien depuis un PC affiche le dashboard **exactement à la taille de l'écran**
(centré, ou réduit si la fenêtre est plus petite) : pratique pour régler la mise en page avant d'avoir l'écran.

La colonne de droite donne **l'URL de l'écran** et la **commande kiosque** prête à copier.

### Onglet « Équipements affichés »

Cochez les équipements à afficher et choisissez pour chacun :

- **Widget** : *Automatique* (le type détecté est indiqué entre parenthèses) ou un widget imposé ;
- **Taille** : tuile normale ou **large** (2 colonnes).
- **Accueil** : l'équipement apparaît sur la page **Accueil**, premier onglet de l'écran, affiché au démarrage.
  L'écran revient automatiquement à l'accueil après 2 minutes sans être touché.

| Widget | Détecté si… | Affichage |
|---|---|---|
| Lumière | types génériques `LIGHT_*` (ou catégorie Lumière) | gros bouton ampoule allumée/éteinte, curseur de luminosité, couleur |
| Prise / interrupteur | `ENERGY_STATE/ON/OFF` (ou catégorie Énergie) | gros bouton marche/arrêt |
| Volet / store | `FLAP_*` (ou catégorie Ouvrant avec actions) | dessin du volet + position, boutons ▲ ■ ▼, curseur |
| Thermostat / chauffage | `THERMOSTAT_*`, `HEATING_*` (ou catégorie Chauffage) | température, état de chauffe, consigne − / +, boutons de mode |
| Capteur | uniquement des infos numériques | grande valeur (température en priorité) avec icône adaptée |
| Détecteur / ouvrants | `OPENING`, `PRESENCE`, `SMOKE`, `FLOOD`, `GARAGE_STATE`… ou infos binaires seules | ouvert/fermé, mouvement, alerte fumée/fuite (clignote en rouge) ; liste avec résumé si l'équipement regroupe plusieurs ouvrants |
| Serrure | `LOCK_*`, plugin Nuki, actions « Verrouiller / Déverrouiller » | état lisible (« Verrouillée »…), confirmation avant d'ouvrir |
| Alarme | `ALARM_*` | activée/désactivée (confirmation avant de désactiver), déclenchement, modes |
| Météo | plugin Météo ou types `WEATHER_*` | condition avec icône, température, min/max, humidité, vent (direction), pluie, pression, lever/coucher, prévisions sur 6 jours |
| Caméra | plugin Caméra ou types `CAMERA_*` | image rafraîchie toutes les 3 s, plein écran au toucher, boutons capture/arrêt |
| Portail / garage | types `GB_*` | boutons Ouvrir / Fermer / Piéton, état « en cours » |
| Spa / piscine | nom contenant « spa », « jacuzzi », « piscine » | température demandée − / +, interrupteurs Marche, Bulles, Filtration, Chauffe |
| Boîte aux lettres | nom contenant « boîte aux lettres » | Vide / Courrier / Colis |
| Poubelles | nom contenant « poubelle » | une poubelle colorée par info binaire (« À sortir ») |
| Robot aspirateur | nom contenant « robot » ou « aspirateur » | dernier ordre, Base / Charge, une touche par pièce |
| Présence des personnes | infos nommées « statut Prénom » | une carte par personne : avatar + bandeau coloré selon l'état |
| Générique | le reste | toutes les commandes : valeurs, interrupteurs On/Off, boutons, curseurs, listes |

Les commandes qu'un widget n'utilise pas sont affichées en dessous (sauf pour la météo, qui a des dizaines
de commandes horaires). Les boutons « Rafraîchir » sont masqués, les batteries s'affichent en petit badge
dans l'en-tête, et les équipements sans commande visible ne sont pas affichés.
La météo, la caméra, le robot et le spa occupent par défaut une tuile large.
Seules les commandes **visibles** des équipements **actifs** apparaissent.

Conseils :

- la détection repose surtout sur les **types génériques** : renseignez-les sur les commandes
  (Configuration avancée de l'équipement > Commandes, ou Outils > Types génériques) ;
- un couple On/Off devient un interrupteur s'il a une **valeur de retour** pointant vers l'info d'état ;
- l'écran utilise la **valeur brute** des infos binaires (l'option « Inverser » de Jeedom ne concerne que
  ses propres widgets) ; pour les ouvertures, la convention est `1 = fermé` ;
- **présence** : les états sont lus dans les actions du virtuel qui modifient « statut Prénom » (nom + valeur) ;
  « pre », « abs » et « taf » deviennent « À la maison », « Pas à la maison » et « Au taf », les autres gardent
  le nom de l'action sans le prénom (renommez l'action dans Jeedom pour changer le texte) ;
- **avatars** : déposez `prénom.png` (ou `prénom-code.png` pour un état précis) dans `plugins/rpidash/data/avatars/`
  (Réglages > Système > Éditeur de fichiers, ou SSH) ;
- les libellés de la boîte aux lettres se règlent en haut de `dashboard/rpidash.js` (`MAILBOX_LABELS`).

### Code de sécurité

Dans l'onglet **Écran**, section **Sécurité**, saisissez un code de 4 à 8 chiffres puis cochez la colonne
**Code** des équipements à protéger (onglet *Équipements affichés*). Sur l'écran, un pavé numérique est alors
demandé avant leurs actions.

- Le code n'est jamais stocké en clair (seule son empreinte est conservée) et il est vérifié par Jeedom :
  l'API refuse l'action sans le bon code, même appelée directement.
- Restent sans code : **activer l'alarme** et **verrouiller** une serrure (ou fermer un portail).
- Après un code correct, les actions suivantes ne le redemandent pas pendant 30 secondes.
- Après 5 codes faux, l'écran est bloqué 5 minutes.
- Pour changer le code, saisissez-en un nouveau ; pour le retirer, cochez **Supprimer le code**.

### Diagnostic

Le bloc **Diagnostic** de l'onglet Écran génère un résumé des équipements de l'écran (commandes, types
génériques, valeurs, widget détecté), sans aucune clé. Copiez-le pour demander de l'aide afin d'adapter les widgets.

Le même résumé est disponible par l'API en lecture seule : `api.php?apikey=CLE_DU_PLUGIN&id=ID_ECRAN&action=diagnostic`.

## Préparer le Raspberry Pi

1. Installez **Raspberry Pi OS (avec bureau)** avec Raspberry Pi Imager, connectez-le au réseau.
2. `sudo raspi-config` > *Display Options* > *Screen Blanking* : **désactivé** (l'écran reste allumé).
3. Copiez l'URL de l'écran depuis Jeedom et testez-la dans Chromium.
4. Lancement automatique en mode kiosque.

   Raspberry Pi OS récent (bureau **labwc**) : ajoutez la commande kiosque à `~/.config/labwc/autostart` :

   ```bash
   mkdir -p ~/.config/labwc
   echo 'chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito --check-for-update-interval=31536000 "URL_DE_L_ECRAN" &' >> ~/.config/labwc/autostart
   ```

   Sur les versions plus anciennes (bureau **X11/LXDE**), ajoutez la même ligne (sans `&`, précédée de `@`)
   dans `~/.config/lxsession/LXDE-pi/autostart`.

   Selon la version, le navigateur s'appelle `chromium-browser` ou `chromium`.
5. Redémarrez : le dashboard s'ouvre en plein écran.

Le point en haut à droite est **vert** quand Jeedom répond, **rouge clignotant** sinon
(le dashboard réessaie automatiquement).

## API

L'écran utilise `plugins/rpidash/core/php/api.php` (POST ou GET), avec `apikey` (clé API du plugin) et `id` (id de l'écran) :

| `action` | Paramètres | Réponse |
|---|---|---|
| `get` | – | configuration de l'écran, pièces, équipements, commandes et valeurs |
| `values` | – | valeurs actuelles des commandes info |
| `diagnostic` | – | résumé des équipements (lecture seule) |
| `exec` | `cmd_id`, `value` (curseur, couleur, liste) ou `title` + `message`, `pin` si l'équipement est protégé | exécute l'action et renvoie les valeurs |

Seules les actions visibles des équipements sélectionnés sur l'écran peuvent être exécutées.

## Sécurité

L'URL contient la clé API **du plugin** (pas la clé principale de Jeedom) : elle donne accès uniquement
aux équipements que vous avez cochés sur les écrans. Utilisez l'écran sur votre réseau local ;
la clé peut être régénérée dans **Réglages > Système > Configuration > API**.
