<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/*
 * API JSON utilisée par l'écran.
 *   action=get     : configuration de l'écran + équipements/commandes
 *   action=values  : valeurs actuelles des commandes info
 *   action=diagnostic : résumé des équipements (lecture seule) pour adapter les widgets
 *   action=exec    : exécute une commande action (cmd_id, value | title + message)
 * Paramètres communs : apikey (clé API du plugin), id (équipement RPi Dash).
 */

require_once __DIR__ . '/../../../../core/php/core.inc.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function rpidash_reply($result, $code = 200) {
    http_response_code($code);
    if ($code == 200) {
        echo json_encode(array('state' => 'ok', 'result' => $result));
    } else {
        echo json_encode(array('state' => 'error', 'error' => $result));
    }
    die();
}

try {
    if (!jeedom::apiAccess(init('apikey'), 'rpidash')) {
        rpidash_reply(__('Clé API invalide', __FILE__), 401);
    }
    $eqLogic = eqLogic::byId(init('id'));
    if (!is_object($eqLogic) || $eqLogic->getEqType_name() != 'rpidash') {
        rpidash_reply(__('Écran introuvable', __FILE__), 404);
    }
    if ($eqLogic->getIsEnable() != 1) {
        rpidash_reply(__('Cet écran est désactivé', __FILE__), 403);
    }

    switch (init('action', 'get')) {
        case 'get':
            rpidash_reply(array(
                'config' => $eqLogic->getScreenConfig(),
                'objects' => $eqLogic->getDashboardObjects(),
                'values' => $eqLogic->getDashboardValues(),
            ));
            break;

        case 'diagnostic':
            // Lecture seule : équipements de cet écran, commandes, types génériques, widget détecté
            rpidash_reply($eqLogic->getDiagnostic());
            break;

        case 'values':
            rpidash_reply(array('values' => $eqLogic->getDashboardValues()));
            break;

        case 'exec':
            $cmd = cmd::byId(init('cmd_id'));
            if (!$eqLogic->isCmdAllowed($cmd)) {
                rpidash_reply(__('Commande non autorisée sur cet écran', __FILE__), 403);
            }
            $options = array();
            switch ($cmd->getSubType()) {
                case 'slider':
                    $options['slider'] = (float) init('value');
                    break;
                case 'color':
                    $options['color'] = init('value');
                    break;
                case 'select':
                    $options['select'] = init('value');
                    break;
                case 'message':
                    $options['title'] = init('title');
                    $options['message'] = init('message');
                    break;
            }
            $cmd->execCmd($options);
            rpidash_reply(array('values' => $eqLogic->getDashboardValues()));
            break;

        default:
            rpidash_reply(__('Action inconnue', __FILE__), 400);
    }
} catch (Exception $e) {
    rpidash_reply($e->getMessage(), 500);
}
