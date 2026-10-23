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

Cochez les équipements à afficher. Sur l'écran :

- seules les **commandes visibles** des **équipements actifs** apparaissent ;
- un couple d'actions *On/Off* relié à une info binaire (valeur de retour) devient **un interrupteur** ;
- les actions *curseur*, *couleur* et *liste* affichent la valeur de leur info liée ;
- les autres actions deviennent des **boutons** (une action *message* demande le texte à envoyer) ;
- les équipements sont regroupés par **pièce** (objet Jeedom), dans l'ordre de Jeedom.

Pour qu'un On/Off soit reconnu comme interrupteur, renseignez la *valeur de retour* des actions
et un type générique (`LIGHT_ON`/`LIGHT_OFF`, `ENERGY_ON`/`ENERGY_OFF`…) ou nommez-les *On*/*Off*.

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
| `exec` | `cmd_id`, `value` (curseur, couleur, liste) ou `title` + `message` | exécute l'action et renvoie les valeurs |

Seules les actions visibles des équipements sélectionnés sur l'écran peuvent être exécutées.

## Sécurité

L'URL contient la clé API **du plugin** (pas la clé principale de Jeedom) : elle donne accès uniquement
aux équipements que vous avez cochés sur les écrans. Utilisez l'écran sur votre réseau local ;
la clé peut être régénérée dans **Réglages > Système > Configuration > API**.
