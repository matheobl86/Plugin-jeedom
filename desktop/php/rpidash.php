<?php
if (!isConnect('admin')) {
    throw new Exception('{{401 - Accès non autorisé}}');
}
$plugin = plugin::byId('rpidash');
sendVarToJS('eqType', $plugin->getId());
sendVarToJS('rpidashBaseUrl', network::getNetworkAccess('internal') . '/plugins/rpidash/core/php/dashboard.php');
sendVarToJS('rpidashApiKey', jeedom::getApiKey('rpidash'));
$eqLogics = eqLogic::byType($plugin->getId());

// Tous les équipements Jeedom (hors écrans RPi Dash), regroupés par objet
$available = array();
foreach (jeeObject::buildTree(null, false) as $object) {
    $available[] = array('name' => $object->getName(), 'eqLogics' => $object->getEqLogic(false, false));
}
$available[] = array('name' => __('Aucun objet', __FILE__), 'eqLogics' => eqLogic::byObjectId(null, false));
?>

<div class="row row-overflow">
  <div class="col-xs-12 eqLogicThumbnailDisplay">
    <legend><i class="fas fa-cog"></i> {{Gestion}}</legend>
    <div class="eqLogicThumbnailContainer">
      <div class="cursor eqLogicAction logoPrimary" data-action="add">
        <i class="fas fa-plus-circle"></i>
        <br>
        <span>{{Ajouter un écran}}</span>
      </div>
      <div class="cursor eqLogicAction logoSecondary" data-action="gotoPluginConf">
        <i class="fas fa-wrench"></i>
        <br>
        <span>{{Configuration}}</span>
      </div>
    </div>
    <legend><i class="fas fa-tv"></i> {{Mes écrans}}</legend>
    <?php if (count($eqLogics) == 0) { ?>
      <div class="text-center" style="font-size:1.2em;font-weight:bold;">{{Aucun écran, cliquez sur "Ajouter un écran" pour commencer}}</div>
    <?php } else { ?>
      <div class="input-group" style="margin:5px;">
        <input class="form-control roundedLeft" placeholder="{{Rechercher}}" id="in_searchEqlogic">
        <div class="input-group-btn">
          <a id="bt_resetSearch" class="btn roundedRight" style="width:30px"><i class="fas fa-times"></i></a>
        </div>
      </div>
      <div class="eqLogicThumbnailContainer">
        <?php
        foreach ($eqLogics as $eqLogic) {
            $opacity = ($eqLogic->getIsEnable()) ? '' : 'disableCard';
            echo '<div class="eqLogicDisplayCard cursor ' . $opacity . '" data-eqLogic_id="' . $eqLogic->getId() . '">';
            echo '<img src="' . $plugin->getPathImgIcon() . '">';
            echo '<br>';
            echo '<span class="name">' . $eqLogic->getHumanName(true, true) . '</span>';
            echo '</div>';
        }
        ?>
      </div>
    <?php } ?>
  </div>

  <div class="col-xs-12 eqLogic" style="display: none;">
    <div class="input-group pull-right" style="display:inline-flex;">
      <span class="input-group-btn">
        <a class="btn btn-sm btn-default eqLogicAction roundedLeft" data-action="configure"><i class="fas fa-cogs"></i><span class="hidden-xs"> {{Configuration avancée}}</span></a>
        <a class="btn btn-sm btn-default eqLogicAction" data-action="copy"><i class="fas fa-copy"></i><span class="hidden-xs"> {{Dupliquer}}</span></a>
        <a class="btn btn-sm btn-success eqLogicAction" data-action="save"><i class="fas fa-check-circle"></i> {{Sauvegarder}}</a>
        <a class="btn btn-sm btn-danger eqLogicAction roundedRight" data-action="remove"><i class="fas fa-minus-circle"></i> {{Supprimer}}</a>
      </span>
    </div>
    <ul class="nav nav-tabs" role="tablist">
      <li role="presentation"><a href="#" class="eqLogicAction" aria-controls="home" role="tab" data-toggle="tab" data-action="returnToThumbnailDisplay"><i class="fas fa-arrow-circle-left"></i></a></li>
      <li role="presentation" class="active"><a href="#eqlogictab" aria-controls="home" role="tab" data-toggle="tab"><i class="fas fa-tv"></i> {{Écran}}</a></li>
      <li role="presentation"><a href="#equipmentstab" aria-controls="profile" role="tab" data-toggle="tab"><i class="fas fa-list"></i> {{Équipements affichés}}</a></li>
    </ul>
    <div class="tab-content">

      <div role="tabpanel" class="tab-pane active" id="eqlogictab">
        <form class="form-horizontal">
          <fieldset>
            <div class="col-lg-6">
              <legend><i class="fas fa-wrench"></i> {{Général}}</legend>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Nom de l'écran}}</label>
                <div class="col-sm-6">
                  <input type="text" class="eqLogicAttr form-control" data-l1key="id" style="display:none;">
                  <input type="text" class="eqLogicAttr form-control" data-l1key="name" placeholder="{{Ex : Écran cuisine}}">
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Objet parent}}</label>
                <div class="col-sm-6">
                  <select class="eqLogicAttr form-control" data-l1key="object_id">
                    <option value="">{{Aucun}}</option>
                    <?php
                    foreach ((jeeObject::buildTree(null, false)) as $object) {
                        echo '<option value="' . $object->getId() . '">' . str_repeat('&nbsp;&nbsp;', $object->getConfiguration('parentNumber')) . $object->getName() . '</option>';
                    }
                    ?>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Options}}</label>
                <div class="col-sm-6">
                  <label class="checkbox-inline"><input type="checkbox" class="eqLogicAttr" data-l1key="isEnable" checked>{{Activer}}</label>
                </div>
              </div>

              <legend><i class="fas fa-desktop"></i> {{Affichage}}</legend>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Taille de l'écran}}
                  <sup><i class="fas fa-question-circle tooltips" title="{{Automatique : le dashboard prend toute la fenêtre. Une taille fixe permet aussi de prévisualiser le rendu depuis un PC.}}"></i></sup>
                </label>
                <div class="col-sm-6">
                  <select class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="screenPreset" id="sel_rpidashPreset">
                    <?php
                    foreach (rpidash::getScreenPresets() as $key => $preset) {
                        echo '<option value="' . $key . '">' . $preset[0] . '</option>';
                    }
                    ?>
                  </select>
                </div>
              </div>
              <div class="form-group rpidashCustomSize" style="display:none;">
                <label class="col-sm-4 control-label">{{Largeur × hauteur (px)}}</label>
                <div class="col-sm-3">
                  <input type="number" min="200" max="7680" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="screenWidth" placeholder="800">
                </div>
                <div class="col-sm-3">
                  <input type="number" min="200" max="4320" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="screenHeight" placeholder="480">
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Orientation}}</label>
                <div class="col-sm-6">
                  <select class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="orientation">
                    <option value="landscape">{{Paysage}}</option>
                    <option value="portrait">{{Portrait}}</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Colonnes}}
                  <sup><i class="fas fa-question-circle tooltips" title="{{0 = calcul automatique selon la largeur de l'écran}}"></i></sup>
                </label>
                <div class="col-sm-6">
                  <input type="number" min="0" max="12" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="columns" placeholder="0">
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Thème}}</label>
                <div class="col-sm-6">
                  <select class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="theme">
                    <option value="dark">{{Sombre}}</option>
                    <option value="light">{{Clair}}</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Rafraîchissement (s)}}</label>
                <div class="col-sm-6">
                  <input type="number" min="1" max="60" step="0.5" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="refresh" placeholder="2">
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Bandeau}}</label>
                <div class="col-sm-6">
                  <label class="checkbox-inline"><input type="checkbox" class="eqLogicAttr" data-l1key="configuration" data-l2key="showClock" checked>{{Horloge}}</label>
                  <label class="checkbox-inline"><input type="checkbox" class="eqLogicAttr" data-l1key="configuration" data-l2key="showRooms" checked>{{Onglets par pièce}}</label>
                </div>
              </div>
            </div>

            <div class="col-lg-6">
              <legend><i class="fas fa-link"></i> {{Lien pour le Raspberry Pi}}</legend>
              <div class="form-group">
                <label class="col-sm-3 control-label">{{URL}}</label>
                <div class="col-sm-8">
                  <div class="input-group">
                    <input type="text" class="form-control roundedLeft" id="in_rpidashUrl" readonly placeholder="{{Sauvegardez l'écran pour obtenir le lien}}">
                    <span class="input-group-btn">
                      <a class="btn btn-default roundedRight" id="bt_rpidashOpen" target="_blank"><i class="fas fa-external-link-alt"></i> {{Ouvrir}}</a>
                    </span>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-3 control-label">{{Commande kiosque}}</label>
                <div class="col-sm-8">
                  <textarea class="form-control" id="ta_rpidashKiosk" rows="3" readonly style="font-family:monospace;"></textarea>
                  <span class="help-block">{{À lancer au démarrage du Raspberry Pi (voir la documentation).}}</span>
                </div>
              </div>

              <legend><i class="fas fa-stethoscope"></i> {{Diagnostic}}</legend>
              <div class="form-group">
                <div class="col-sm-offset-3 col-sm-8">
                  <span class="help-block">{{Génère un résumé des équipements de cet écran (noms, commandes, types génériques, valeurs, widget détecté), sans la clé API. Copiez-le pour demander de l'aide afin d'adapter les widgets.}}</span>
                  <a class="btn btn-default" id="bt_rpidashDiagnostic"><i class="fas fa-file-medical-alt"></i> {{Générer}}</a>
                  <a class="btn btn-default" id="bt_rpidashDiagnosticCopy" style="display:none;"><i class="fas fa-copy"></i> {{Copier}}</a>
                  <textarea class="form-control" id="ta_rpidashDiagnostic" rows="10" readonly style="font-family:monospace;margin-top:8px;display:none;"></textarea>
                </div>
              </div>
            </div>
          </fieldset>
        </form>
      </div>

      <div role="tabpanel" class="tab-pane" id="equipmentstab">
        <br>
        <div class="input-group" style="margin-bottom:10px;">
          <input class="form-control roundedLeft" placeholder="{{Filtrer les équipements}}" id="in_rpidashFilter">
          <span class="input-group-btn">
            <a class="btn btn-default" id="bt_rpidashCheckAll"><i class="fas fa-check-square"></i> {{Tout cocher}}</a>
            <a class="btn btn-default roundedRight" id="bt_rpidashUncheckAll"><i class="far fa-square"></i> {{Tout décocher}}</a>
          </span>
        </div>
        <div id="div_rpidashEquipments">
          <?php
          $widgetTypes = rpidash::getWidgetTypes();
          foreach ($available as $group) {
              $rows = '';
              foreach ($group['eqLogics'] as $eq) {
                  if ($eq->getEqType_name() == 'rpidash') {
                      continue;
                  }
                  $detected = rpidash::detectWidget($eq);
                  $disabled = $eq->getIsEnable() ? '' : ' <span class="label label-default">{{Désactivé}}</span>';
                  $rows .= '<tr class="rpidashEqItem" data-search="' . htmlspecialchars(strtolower($group['name'] . ' ' . $eq->getName() . ' ' . $eq->getEqType_name())) . '">';
                  $rows .= '<td><label style="font-weight:normal;margin:0;"><input type="checkbox" class="rpidashEqSelect" data-id="' . $eq->getId() . '"> ';
                  $rows .= htmlspecialchars($eq->getName()) . ' <small class="text-muted">(' . $eq->getEqType_name() . ')</small>' . $disabled . '</label></td>';
                  $rows .= '<td style="width:300px;"><select class="form-control input-sm rpidashEqWidget" data-id="' . $eq->getId() . '">';
                  foreach ($widgetTypes as $key => $label) {
                      if ($key == 'auto') {
                          $label .= ' (' . $widgetTypes[$detected] . ')';
                      }
                      $rows .= '<option value="' . $key . '">' . htmlspecialchars($label) . '</option>';
                  }
                  $rows .= '</select></td>';
                  $rows .= '<td style="width:130px;"><select class="form-control input-sm rpidashEqSize" data-id="' . $eq->getId() . '">';
                  $rows .= '<option value="0">{{Taille auto}}</option><option value="1">{{Tuile normale}}</option><option value="2">{{Tuile large}}</option>';
                  $rows .= '</select></td></tr>';
              }
              if ($rows == '') {
                  continue;
              }
              echo '<fieldset class="rpidashGroup"><legend>' . htmlspecialchars($group['name']) . '</legend>';
              echo '<table class="table table-condensed table-hover"><thead><tr><th>{{Équipement}}</th><th>{{Widget}}</th><th>{{Taille}}</th></tr></thead><tbody>' . $rows . '</tbody></table></fieldset>';
          }
          ?>
        </div>
        <span class="help-block">{{Le widget « Automatique » est choisi d'après les types génériques des commandes et la catégorie de l'équipement (le type détecté est indiqué entre parenthèses). Seules les commandes visibles des équipements actifs sont affichées ; les commandes non utilisées par le widget apparaissent en dessous.}}</span>
      </div>

    </div>
  </div>
</div>

<?php include_file('desktop', 'rpidash', 'js', 'rpidash'); ?>
<?php include_file('core', 'plugin.template', 'js'); ?>
