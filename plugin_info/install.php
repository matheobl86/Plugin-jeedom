<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

require_once __DIR__ . '/../../../core/php/core.inc.php';

function rpidash_install() {
    // Génère la clé API dédiée au plugin (utilisée par l'écran)
    jeedom::getApiKey('rpidash');
}

function rpidash_update() {
    jeedom::getApiKey('rpidash');
    foreach (eqLogic::byType('rpidash') as $eqLogic) {
        $eqLogic->save();
    }
}

function rpidash_remove() {
}
