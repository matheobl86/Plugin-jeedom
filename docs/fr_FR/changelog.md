# Changelog RPi Dash

## 1.2.0

- Nouveaux widgets : météo (prévisions), caméra, portail, spa, boîte aux lettres, poubelles, robot aspirateur, présence.
- Serrures Nuki, ouvrants en liste, capteurs avec min/max, tendance et pastilles, thermostat enrichi
  (statut, température extérieure, verrouillage), chauffages simples en interrupteur.
- Boutons « Rafraîchir » masqués, batteries en badge, équipements vides masqués, meilleure détection On/Off/Toggle.
- Valeurs binaires brutes (l'option « Inverser » n'est plus appliquée).
- Le diagnostic masque les clés présentes dans les valeurs (URL de caméra…).

## 1.1.0

- Widgets adaptés au type d'équipement, détectés automatiquement : lumière, prise, volet, thermostat,
  capteur, détecteur, serrure, alarme (ou générique).
- Choix du widget et de la taille de tuile (normale/large) par équipement.
- Diagnostic des équipements (page de configuration et API `action=diagnostic`).
- Respect de l'option « Inverser » des infos binaires.

## 1.0.0

- Première version : écrans configurables (taille, orientation, colonnes, thème, rafraîchissement),
  sélection des équipements, interrupteurs On/Off, boutons, curseurs, couleurs, listes, messages,
  onglets par pièce, horloge, indicateur de connexion.
