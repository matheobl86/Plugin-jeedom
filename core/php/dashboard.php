<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/*
 * Page affichée par le Raspberry Pi :
 *   /plugins/rpidash/core/php/dashboard.php?apikey=CLE_DU_PLUGIN&id=ID_ECRAN
 */

require_once __DIR__ . '/../../../../core/php/core.inc.php';

header('Cache-Control: no-store');

$apikey = init('apikey');
if (!jeedom::apiAccess($apikey, 'rpidash')) {
    http_response_code(401);
    die('RPi Dash : clé API invalide');
}
$eqLogic = null;
if (init('id') != '') {
    $eqLogic = eqLogic::byId(init('id'));
} else {
    // Sans id, on prend le premier écran actif
    foreach (eqLogic::byType('rpidash', true) as $candidate) {
        $eqLogic = $candidate;
        break;
    }
}
if (!is_object($eqLogic) || $eqLogic->getEqType_name() != 'rpidash') {
    http_response_code(404);
    die('RPi Dash : écran introuvable');
}

$assets = __DIR__ . '/../../dashboard/';
$boot = array(
    'apiUrl' => 'api.php',
    // Racine de Jeedom vue depuis cette page (images des caméras…)
    'root' => '../../../../',
    'apikey' => $apikey,
    'id' => (int) $eqLogic->getId(),
);
$jsonFlags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
?>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="mobile-web-app-capable" content="yes">
  <title><?php echo htmlspecialchars($eqLogic->getName()); ?></title>
  <style><?php echo file_get_contents($assets . 'rpidash.css'); ?></style>
</head>
<body>
  <div id="stage">
    <div id="app">
      <header id="topbar">
        <div id="title"></div>
        <nav id="rooms"></nav>
        <div id="status" title="Connexion"></div>
        <div id="clock"></div>
      </header>
      <main id="grid"><div class="message">Chargement…</div></main>
    </div>
  </div>
  <script>window.RPIDASH = <?php echo json_encode($boot, $jsonFlags); ?>;</script>
  <script><?php echo file_get_contents($assets . 'rpidash.js'); ?></script>
</body>
</html>
