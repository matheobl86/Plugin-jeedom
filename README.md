# RPi Dash — plugin Jeedom

Tableau de bord tactile pour Raspberry Pi : affiche l'état de vos équipements Jeedom et permet de piloter
leurs commandes (interrupteurs, boutons, curseurs, couleurs, listes) depuis l'écran.

- Taille d'écran réglable (préréglages 3,5" à Full HD, ou personnalisée), orientation, colonnes, thème clair/sombre
- Widgets adaptés à chaque équipement (lumière, volet, thermostat, capteur, détecteur, serrure, alarme), détectés automatiquement ou choisis
- Choix des équipements affichés, regroupés par pièce, tuiles normales ou larges
- Clé API dédiée au plugin, actions limitées aux équipements exposés
- Aucun logiciel à installer sur le Raspberry Pi : Chromium en mode kiosque suffit

Documentation : [docs/fr_FR/index.md](docs/fr_FR/index.md)

## Structure

```
plugin_info/          info.json, installation, configuration du plugin, icône
core/class/           classes rpidash (écran) et rpidashCmd
core/ajax/             diagnostic depuis la page de configuration
core/php/api.php      API JSON utilisée par l'écran
core/php/dashboard.php  page affichée par le Raspberry Pi
dashboard/            CSS et JS du dashboard
desktop/              page de configuration dans Jeedom
```
