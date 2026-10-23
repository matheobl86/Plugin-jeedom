<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

require_once __DIR__ . '/../../../../core/php/core.inc.php';

class rpidash extends eqLogic {

    /*     * *************************Attributs****************************** */

    private static $_defaults = array(
        'screenPreset' => 'auto',
        'screenWidth' => 800,
        'screenHeight' => 480,
        'orientation' => 'landscape',
        'columns' => 0,
        'theme' => 'dark',
        'refresh' => 2,
        'showClock' => 1,
        'showRooms' => 1,
        'equipments' => '',
        'widgets' => '',
    );

    /*     * ***********************Methode static*************************** */

    /**
     * Tailles d'écran proposées : clé => [libellé, largeur, hauteur].
     * 0 x 0 = le dashboard occupe toute la fenêtre du navigateur.
     */
    public static function getScreenPresets() {
        return array(
            'auto' => array(__('Automatique (plein écran)', __FILE__), 0, 0),
            '480x320' => array(__('480 × 320 (écran 3,5")', __FILE__), 480, 320),
            '800x480' => array(__('800 × 480 (écran officiel Raspberry 7")', __FILE__), 800, 480),
            '1024x600' => array(__('1024 × 600 (écran 7" / 10" HDMI)', __FILE__), 1024, 600),
            '1280x720' => array(__('1280 × 720 (Touch Display 2, HD)', __FILE__), 1280, 720),
            '1280x800' => array(__('1280 × 800 (écran 10")', __FILE__), 1280, 800),
            '1920x1080' => array(__('1920 × 1080 (Full HD)', __FILE__), 1920, 1080),
            'custom' => array(__('Personnalisée', __FILE__), 0, 0),
        );
    }

    public static function getWidgetTypes() {
        return array(
            'auto' => __('Automatique', __FILE__),
            'light' => __('Lumière', __FILE__),
            'plug' => __('Prise / interrupteur', __FILE__),
            'shutter' => __('Volet / store', __FILE__),
            'thermostat' => __('Thermostat / chauffage', __FILE__),
            'sensor' => __('Capteur (valeurs)', __FILE__),
            'detector' => __('Détecteur / ouvrants (ouverture, mouvement, fumée…)', __FILE__),
            'lock' => __('Serrure', __FILE__),
            'alarm' => __('Alarme', __FILE__),
            'weather' => __('Météo', __FILE__),
            'camera' => __('Caméra', __FILE__),
            'gate' => __('Portail / garage', __FILE__),
            'spa' => __('Spa / piscine', __FILE__),
            'mailbox' => __('Boîte aux lettres', __FILE__),
            'trash' => __('Poubelles', __FILE__),
            'vacuum' => __('Robot aspirateur', __FILE__),
            'people' => __('Présence des personnes', __FILE__),
            'generic' => __('Générique (toutes les commandes)', __FILE__),
        );
    }

    /**
     * Taille de tuile par défaut (en colonnes) quand l'utilisateur n'en a pas choisi.
     */
    public static function defaultSize($widget) {
        return in_array($widget, array('weather', 'camera', 'vacuum', 'spa')) ? 2 : 1;
    }

    /**
     * Commande "Rafraîchir" présente sur presque tous les équipements : inutile sur l'écran.
     */
    public static function isRefreshCmd($cmd) {
        return $cmd->getType() == 'action'
            && (strtolower($cmd->getLogicalId()) == 'refresh' || preg_match('/^\s*(rafra[iî]chir|refresh)\s*$/iu', $cmd->getName()));
    }

    /**
     * Devine le widget le plus adapté à un équipement, d'après son plugin, les types génériques
     * de ses commandes, son nom puis sa catégorie Jeedom.
     */
    public static function detectWidget($eqLogic) {
        $plugin = strtolower($eqLogic->getEqType_name());
        $name = $eqLogic->getName();
        $types = array();
        $actionNames = array();
        $infoNames = array();
        $hasAction = false;
        $hasNumeric = false;
        $hasBinary = false;
        foreach ($eqLogic->getCmd() as $cmd) {
            if (self::isRefreshCmd($cmd)) {
                continue;
            }
            $genericType = strtoupper(self::genericType($cmd));
            if ($genericType != '') {
                $types[] = $genericType;
            }
            if ($cmd->getType() == 'action') {
                $hasAction = true;
                $actionNames[] = $cmd->getName();
            } else {
                $infoNames[] = $cmd->getName();
                if ($cmd->getSubType() == 'numeric') {
                    $hasNumeric = true;
                } elseif ($cmd->getSubType() == 'binary') {
                    $hasBinary = true;
                }
            }
        }
        $hasType = function ($regex) use ($types) {
            return count(preg_grep($regex, $types)) > 0;
        };
        $nameIs = function ($regex) use ($name) {
            return preg_match($regex . 'iu', $name) === 1;
        };
        $lightName = '/lumi[eèé]re|lampe|led\b|plafonn?ier|spot|applique|[ée]clairage|ampoule|guirlande/';

        if ($plugin == 'weather' || $hasType('/^WEATHER_/')) {
            return 'weather';
        }
        if ($plugin == 'camera' || $hasType('/^CAMERA_/')) {
            return 'camera';
        }
        if ($hasType('/^THERMOSTAT_/')) {
            return 'thermostat';
        }
        if ($hasType('/^FLAP_/')) {
            return 'shutter';
        }
        if ($hasType('/^LOCK_/') || $plugin == 'nuki' || count(preg_grep('/^(d[ée])?verrouiller$/iu', $actionNames)) > 0) {
            return 'lock';
        }
        if ($hasType('/^ALARM_/')) {
            return 'alarm';
        }
        if ($hasType('/^GB_/')) {
            return 'gate';
        }
        if ($nameIs('/spa\b|jacuzzi|piscine/')) {
            return 'spa';
        }
        if ($nameIs('/bo[iî]te aux lettres|mailbox|courrier/')) {
            return 'mailbox';
        }
        if ($nameIs('/poubelle|d[ée]chet/')) {
            return 'trash';
        }
        if ($nameIs('/robot|aspirateur|vacuum|roborock/') || in_array($plugin, array('roborock', 'xiaomivacuum', 'neato'))) {
            return 'vacuum';
        }
        if (count(preg_grep('/^statut\s+\S/iu', $infoNames)) > 0) {
            return 'people';
        }
        if ($hasType('/^HEATING_/') || ($hasAction && $nameIs('/chauffage|radiateur|convecteur|heater/'))) {
            return 'thermostat';
        }
        if ($hasType('/^LIGHT_/') || ($hasType('/^ENERGY_/') && $nameIs($lightName))) {
            return 'light';
        }
        if ($hasType('/^ENERGY_(STATE|ON|OFF)$/')) {
            return 'plug';
        }
        if ($hasType('/^(OPENING|OPENING_WINDOW|PRESENCE|SMOKE|FLOOD|GARAGE_STATE|GATE_STATE|BARRIER_STATE)$/')) {
            return 'detector';
        }
        if ($hasAction) {
            if ($nameIs($lightName)) {
                return 'light';
            }
            $byCategory = array('light' => 'light', 'heating' => 'thermostat', 'opening' => 'shutter', 'energy' => 'plug');
            foreach ($byCategory as $category => $widget) {
                if ($eqLogic->getCategory($category, 0) == 1) {
                    return $widget;
                }
            }
            return 'generic';
        }
        if ($hasNumeric) {
            return 'sensor';
        }
        if ($hasBinary) {
            return 'detector';
        }
        return 'generic';
    }

    /*     * *********************Méthodes d'instance************************* */

    public function preSave() {
        foreach (self::$_defaults as $key => $value) {
            if ($this->getConfiguration($key, '') === '') {
                $this->setConfiguration($key, $value);
            }
        }
        $refresh = (float) $this->getConfiguration('refresh');
        $this->setConfiguration('refresh', max(1, min(60, $refresh)));
    }

    public function getSelectedEquipmentIds() {
        $ids = array_map('intval', explode(',', (string) $this->getConfiguration('equipments', '')));
        return array_values(array_unique(array_filter($ids)));
    }

    /**
     * Réglages par équipement, stockés sous la forme "id:widget:taille,id:widget:taille".
     */
    public function getEquipmentOptions() {
        $widgets = self::getWidgetTypes();
        $options = array();
        foreach (explode(',', (string) $this->getConfiguration('widgets', '')) as $entry) {
            $parts = explode(':', trim($entry));
            if (count($parts) < 2 || (int) $parts[0] <= 0) {
                continue;
            }
            $options[(int) $parts[0]] = array(
                'widget' => isset($widgets[$parts[1]]) ? $parts[1] : 'auto',
                'size' => isset($parts[2]) ? max(0, min(2, (int) $parts[2])) : 0,
            );
        }
        return $options;
    }

    public function getScreenConfig() {
        $preset = $this->getConfiguration('screenPreset', 'auto');
        $presets = self::getScreenPresets();
        if (!isset($presets[$preset])) {
            $preset = 'auto';
        }
        if ($preset == 'custom') {
            $width = (int) $this->getConfiguration('screenWidth');
            $height = (int) $this->getConfiguration('screenHeight');
        } else {
            $width = $presets[$preset][1];
            $height = $presets[$preset][2];
        }
        return array(
            'title' => $this->getName(),
            'preset' => $preset,
            'width' => max(0, $width),
            'height' => max(0, $height),
            'orientation' => $this->getConfiguration('orientation', 'landscape'),
            'columns' => (int) $this->getConfiguration('columns', 0),
            'theme' => $this->getConfiguration('theme', 'dark'),
            'refresh' => (float) $this->getConfiguration('refresh', 2),
            'showClock' => (int) $this->getConfiguration('showClock', 1),
            'showRooms' => (int) $this->getConfiguration('showRooms', 1),
        );
    }

    /**
     * Équipements sélectionnés et actifs, regroupés par objet (pièce) dans l'ordre de Jeedom.
     */
    public function getDashboardObjects() {
        $groups = array();
        $options = $this->getEquipmentOptions();
        foreach ($this->getSelectedEquipmentIds() as $eqLogicId) {
            $eqLogic = eqLogic::byId($eqLogicId);
            if (!is_object($eqLogic) || $eqLogic->getIsEnable() != 1) {
                continue;
            }
            $cmds = array();
            $camera = '';
            foreach ($eqLogic->getCmd() as $cmd) {
                if (strtoupper(self::genericType($cmd)) == 'CAMERA_URL') {
                    $camera = (string) self::cmdValue($cmd);
                }
                if ($cmd->getIsVisible() == 1 && !self::isRefreshCmd($cmd)) {
                    $cmds[] = self::formatCmd($cmd);
                }
            }
            if (count($cmds) == 0 && $camera == '') {
                continue;
            }
            $objectId = (int) $eqLogic->getObject_id();
            if (!isset($groups[$objectId])) {
                $object = $eqLogic->getObject();
                $groups[$objectId] = array(
                    'id' => $objectId,
                    'name' => is_object($object) ? $object->getName() : __('Aucun', __FILE__),
                    'eqLogics' => array(),
                );
            }
            $option = isset($options[$eqLogicId]) ? $options[$eqLogicId] : array('widget' => 'auto', 'size' => 0);
            $widget = $option['widget'] == 'auto' ? self::detectWidget($eqLogic) : $option['widget'];
            $groups[$objectId]['eqLogics'][] = array(
                'id' => (int) $eqLogic->getId(),
                'name' => $eqLogic->getName(),
                'order' => (int) $eqLogic->getOrder(),
                'widget' => $widget,
                'size' => $option['size'] > 0 ? $option['size'] : self::defaultSize($widget),
                'camera' => $camera,
                'cmds' => $cmds,
            );
        }

        $positions = array();
        foreach (jeeObject::buildTree(null, false) as $index => $object) {
            $positions[(int) $object->getId()] = $index;
        }
        uasort($groups, function ($a, $b) use ($positions) {
            $pa = isset($positions[$a['id']]) ? $positions[$a['id']] : PHP_INT_MAX;
            $pb = isset($positions[$b['id']]) ? $positions[$b['id']] : PHP_INT_MAX;
            return $pa - $pb;
        });
        foreach ($groups as &$group) {
            usort($group['eqLogics'], function ($a, $b) {
                return ($a['order'] - $b['order']) ?: strcasecmp($a['name'], $b['name']);
            });
        }
        return array_values($groups);
    }

    /**
     * Valeurs actuelles des commandes info affichées (y compris les infos liées aux actions).
     */
    public function getDashboardValues() {
        $values = array();
        foreach ($this->getSelectedEquipmentIds() as $eqLogicId) {
            $eqLogic = eqLogic::byId($eqLogicId);
            if (!is_object($eqLogic) || $eqLogic->getIsEnable() != 1) {
                continue;
            }
            foreach ($eqLogic->getCmd() as $cmd) {
                if ($cmd->getIsVisible() != 1) {
                    continue;
                }
                if ($cmd->getType() == 'info') {
                    $values[$cmd->getId()] = self::cmdValue($cmd);
                } else {
                    $linkedId = self::linkedInfoId($cmd);
                    if ($linkedId > 0 && !isset($values[$linkedId])) {
                        $linked = cmd::byId($linkedId);
                        if (is_object($linked)) {
                            $values[$linkedId] = self::cmdValue($linked);
                        }
                    }
                }
            }
        }
        return (object) $values;
    }

    /**
     * Une commande ne peut être exécutée depuis l'écran que si c'est une action visible
     * d'un équipement actif sélectionné sur ce dashboard.
     */
    public function isCmdAllowed($cmd) {
        if (!is_object($cmd) || $cmd->getType() != 'action' || $cmd->getIsVisible() != 1) {
            return false;
        }
        $eqLogic = $cmd->getEqLogic();
        if (!is_object($eqLogic) || $eqLogic->getIsEnable() != 1) {
            return false;
        }
        return in_array((int) $eqLogic->getId(), $this->getSelectedEquipmentIds(), true);
    }

    private static function formatCmd($cmd) {
        $data = array(
            'id' => (int) $cmd->getId(),
            'name' => $cmd->getName(),
            'type' => $cmd->getType(),
            'subType' => $cmd->getSubType(),
            'unit' => $cmd->getUnite(),
            'genericType' => self::genericType($cmd),
        );
        if ($cmd->getType() == 'action') {
            $linkedId = self::linkedInfoId($cmd);
            $data['linked'] = $linkedId;
            $data['linkedSubType'] = '';
            if ($linkedId > 0) {
                $linked = cmd::byId($linkedId);
                if (is_object($linked)) {
                    $data['linkedSubType'] = $linked->getSubType();
                    $data['linkedUnit'] = $linked->getUnite();
                }
            }
            if ($cmd->getSubType() == 'slider') {
                $data['min'] = (float) $cmd->getConfiguration('minValue', 0);
                $data['max'] = (float) $cmd->getConfiguration('maxValue', 100);
                $parameters = $cmd->getDisplay('parameters', array());
                $step = (is_array($parameters) && isset($parameters['step'])) ? (float) $parameters['step'] : 1;
                $data['step'] = $step > 0 ? $step : 1;
            }
            if ($cmd->getSubType() == 'select') {
                $data['list'] = self::parseListValue($cmd->getConfiguration('listValue', ''));
            }
        }
        return $data;
    }

    private static function genericType($cmd) {
        return method_exists($cmd, 'getGeneric_type') ? (string) $cmd->getGeneric_type() : '';
    }

    /**
     * Résumé des équipements sélectionnés (sans clé API) pour diagnostiquer l'affichage.
     */
    public function getDiagnostic() {
        $options = $this->getEquipmentOptions();
        $equipments = array();
        foreach ($this->getSelectedEquipmentIds() as $eqLogicId) {
            $eqLogic = eqLogic::byId($eqLogicId);
            if (!is_object($eqLogic)) {
                continue;
            }
            $cmds = array();
            foreach ($eqLogic->getCmd() as $cmd) {
                $line = array(
                    'id' => (int) $cmd->getId(),
                    'name' => $cmd->getName(),
                    'type' => $cmd->getType() . '/' . $cmd->getSubType(),
                    'generic' => self::genericType($cmd),
                    'visible' => (int) $cmd->getIsVisible(),
                );
                if ($cmd->getType() == 'info') {
                    $line['value'] = self::cmdValue($cmd);
                    if (is_string($line['value'])) {
                        // Ne jamais exposer de clé (ex. URL de snapshot des caméras)
                        $line['value'] = preg_replace('/(apikey|api_key|token|password|pwd)=[^&\\s"]*/i', '$1=***', $line['value']);
                    }
                    $line['unit'] = $cmd->getUnite();
                } elseif (self::linkedInfoId($cmd) > 0) {
                    $line['linked'] = self::linkedInfoId($cmd);
                }
                $cmds[] = $line;
            }
            $object = $eqLogic->getObject();
            $equipments[] = array(
                'id' => (int) $eqLogic->getId(),
                'name' => $eqLogic->getName(),
                'room' => is_object($object) ? $object->getName() : '',
                'plugin' => $eqLogic->getEqType_name(),
                'enabled' => (int) $eqLogic->getIsEnable(),
                'detected' => self::detectWidget($eqLogic),
                'chosen' => isset($options[$eqLogicId]) ? $options[$eqLogicId]['widget'] : 'auto',
                'cmds' => $cmds,
            );
        }
        return array(
            'plugin' => 'rpidash',
            'version' => '1.2.0',
            'jeedom' => method_exists('jeedom', 'version') ? jeedom::version() : '',
            'screen' => $this->getScreenConfig(),
            'equipments' => $equipments,
        );
    }

    private static function linkedInfoId($cmd) {
        return (int) trim((string) $cmd->getValue(), '# ');
    }

    private static function cmdValue($cmd) {
        try {
            $value = $cmd->execCmd();
        } catch (Exception $e) {
            return null;
        }
        if ($cmd->getSubType() == 'binary') {
            // Valeur brute de l'équipement : l'option "Inverser" de Jeedom ne concerne que ses propres widgets
            return (int) (bool) $value;
        }
        if ($cmd->getSubType() == 'numeric' && is_numeric($value)) {
            return $value + 0;
        }
        return $value;
    }

    private static function parseListValue($listValue) {
        $list = array();
        foreach (explode(';', (string) $listValue) as $entry) {
            if (trim($entry) === '') {
                continue;
            }
            $parts = explode('|', $entry, 2);
            $list[] = array('value' => $parts[0], 'label' => isset($parts[1]) ? $parts[1] : $parts[0]);
        }
        return $list;
    }
}

class rpidashCmd extends cmd {

    public function execute($_options = array()) {
    }
}
