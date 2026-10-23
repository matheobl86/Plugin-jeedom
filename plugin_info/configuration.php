<?php
require_once __DIR__ . '/../../../core/php/core.inc.php';
include_file('core', 'authentification', 'php');
if (!isConnect('admin')) {
    include_file('desktop', '404', 'php');
    die();
}
?>
<form class="form-horizontal">
  <fieldset>
    <div class="form-group">
      <label class="col-md-4 control-label">{{Clé API du plugin}}
        <sup><i class="fas fa-question-circle tooltips" title="{{Utilisée par l'écran pour lire les états et exécuter les actions. Elle peut être régénérée dans Réglages > Système > Configuration > API.}}"></i></sup>
      </label>
      <div class="col-md-6">
        <input class="form-control" type="text" readonly value="<?php echo jeedom::getApiKey('rpidash'); ?>">
      </div>
    </div>
    <div class="form-group">
      <div class="col-md-offset-4 col-md-6">
        <span class="help-block">{{Chaque écran se configure comme un équipement du plugin (Plugins > Organisation > RPi Dash).}}</span>
      </div>
    </div>
  </fieldset>
</form>
