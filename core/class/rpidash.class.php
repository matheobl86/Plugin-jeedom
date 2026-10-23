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
        foreach ($this->getSelectedEquipmentIds() as $eqLogicId) {
            $eqLogic = eqLogic::byId($eqLogicId);
            if (!is_object($eqLogic) || $eqLogic->getIsEnable() != 1) {
                continue;
            }
            $cmds = array();
            foreach ($eqLogic->getCmd() as $cmd) {
                if ($cmd->getIsVisible() == 1) {
                    $cmds[] = self::formatCmd($cmd);
                }
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
            $groups[$objectId]['eqLogics'][] = array(
                'id' => (int) $eqLogic->getId(),
                'name' => $eqLogic->getName(),
                'order' => (int) $eqLogic->getOrder(),
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
            'genericType' => method_exists($cmd, 'getGeneric_type') ? (string) $cmd->getGeneric_type() : '',
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
